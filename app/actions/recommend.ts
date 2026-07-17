'use server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Source } from '@/lib/types'
import { scrapeText } from './scrape'
import { searchPlace, getPlaceDetails, nearbySearch } from './places'
import { validateType } from '@/lib/placeType'
import { REC_CATEGORIES, resolveDayCenter, centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, splitShownReserve } from '@/lib/utils/dayRecommend'
import type { DayItinerary, DayRecommendation, RecommendationsByDay, CategoryBuckets, Place } from '@/lib/types'
import { callClaude } from '@/lib/claude'
import { shouldEnrichRecommendationsWithDetails } from '@/lib/googleMapsCost'
import { openPoiSearch } from '@/lib/openPoi'
import { ensurePoiBackfill } from '@/lib/poiBackfill'
import { runWithTripId } from '@/lib/apiUsageContext'

const REC_LIMIT = 5
const OPEN_POI_RADII_METERS = [4000, 12000]
const GOOGLE_SOURCE_LABEL = 'Google 推薦'
const GOOGLE_REASON = 'Google 高評分推薦'
const OPEN_POI_SOURCE_LABEL = 'Open POI'
const OPEN_POI_REASON = '開放 POI 候選池推薦'

async function maybeEnrichRecommendationDetails(
  place: Place,
  category: 'dessert' | 'attraction' | 'restaurant'
): Promise<Place> {
  if (!shouldEnrichRecommendationsWithDetails()) return { ...place, type: category }
  const detailed = await getPlaceDetails(place.placeId)
  return detailed
    ? { ...place, ...detailed, type: category, description: detailed.description ?? place.description }
    : { ...place, type: category }
}

async function safeOpenPoiSearch(
  lat: number,
  lng: number,
  category: 'dessert' | 'attraction' | 'restaurant',
  limit = REC_LIMIT,
  radiusMeters = OPEN_POI_RADII_METERS[0]
): Promise<Place[]> {
  try {
    return await openPoiSearch(lat, lng, category, limit, radiusMeters)
  } catch {
    return []
  }
}

async function pushRecommendationCandidates(
  target: DayRecommendation[],
  candidates: Place[],
  category: 'dessert' | 'attraction' | 'restaurant',
  have: Set<string>,
  sourceLabel: string,
  reason: string
): Promise<void> {
  for (const candidate of candidates) {
    if (target.length >= REC_LIMIT) break
    if (have.has(candidate.placeId)) continue
    const filled = sourceLabel === GOOGLE_SOURCE_LABEL
      ? await maybeEnrichRecommendationDetails(candidate, category)
      : { ...candidate, type: category }
    target.push({ ...filled, reason, sourceLabel })
    have.add(candidate.placeId)
  }
}

function hasRecommendationPhoto(place: Pick<Place, 'photoUrl' | 'photoUrls'>): boolean {
  return Boolean(place.photoUrl) || (place.photoUrls?.length ?? 0) > 0
}

async function replacePhotoLessWithGoogleCandidates(
  target: DayRecommendation[],
  candidates: Place[],
  category: 'dessert' | 'attraction' | 'restaurant',
  have: Set<string>
): Promise<void> {
  let replacementIndex = target.findIndex((item) => !hasRecommendationPhoto(item))
  for (const candidate of candidates) {
    if (replacementIndex === -1) break
    if (have.has(candidate.placeId)) continue
    if (!hasRecommendationPhoto(candidate)) continue

    const filled = await maybeEnrichRecommendationDetails(candidate, category)
    if (!hasRecommendationPhoto(filled)) continue

    const replaced = target[replacementIndex]
    target[replacementIndex] = { ...filled, reason: GOOGLE_REASON, sourceLabel: GOOGLE_SOURCE_LABEL }
    have.delete(replaced.placeId)
    have.add(filled.placeId)
    replacementIndex = target.findIndex((item, index) => index > replacementIndex && !hasRecommendationPhoto(item))
  }
}

async function fillFromOpenData(
  target: DayRecommendation[],
  center: { lat: number; lng: number },
  category: 'dessert' | 'attraction' | 'restaurant',
  have: Set<string>
): Promise<boolean> {
  for (const radius of OPEN_POI_RADII_METERS) {
    const openCandidates = await safeOpenPoiSearch(center.lat, center.lng, category, REC_LIMIT, radius)
    await pushRecommendationCandidates(target, openCandidates, category, have, OPEN_POI_SOURCE_LABEL, OPEN_POI_REASON)
    if (target.length >= REC_LIMIT) return true
  }
  return target.length >= REC_LIMIT
}

async function scheduleBackfill(
  lat: number,
  lng: number,
  category: 'dessert' | 'attraction' | 'restaurant'
): Promise<void> {
  try {
    // Run the OSM backfill AFTER the response so it never adds latency to this
    // request (Overpass can take seconds, and days are processed serially).
    // Dynamic-import so 'next/server' isn't in this module's static graph (it
    // fails to load under the jsdom test environment).
    const { after } = await import('next/server')
    after(() => ensurePoiBackfill(lat, lng, category))
  } catch {
    // after() is only valid within a request scope; ignore elsewhere (tests/scripts).
  }
}

async function fillFromOpenPoiThenGoogle(
  target: DayRecommendation[],
  center: { lat: number; lng: number },
  category: 'dessert' | 'attraction' | 'restaurant',
  have: Set<string>
): Promise<void> {
  if (await fillFromOpenData(target, center, category, have)) {
    if (target.every(hasRecommendationPhoto)) return
    const googleCandidates = await nearbySearch(center.lat, center.lng, category)
    await replacePhotoLessWithGoogleCandidates(target, googleCandidates, category, have)
    return
  }

  // Open data was insufficient for this area. Populate it from free OSM/Overpass
  // data in the background (deduped per cell) so FUTURE loads use free data, and
  // serve this request from Google now — no added latency.
  await scheduleBackfill(center.lat, center.lng, category)

  const googleCandidates = await nearbySearch(center.lat, center.lng, category)
  await pushRecommendationCandidates(target, googleCandidates, category, have, GOOGLE_SOURCE_LABEL, GOOGLE_REASON)
}

export async function getDayRecommendations(
  days: DayItinerary[],
  tripId?: string
): Promise<RecommendationsByDay> {
  return runWithTripId(tripId, () => getDayRecommendationsImpl(days))
}

async function getDayRecommendationsImpl(
  days: DayItinerary[]
): Promise<RecommendationsByDay> {
  const existingIds = new Set(days.flatMap((d) => d.places.map((p) => p.placeId)))

  let extracted: DayRecommendation[] = []
  try {
    const raw = await readFile(join(process.cwd(), 'config/sources.json'), 'utf-8')
    const sources: Source[] = JSON.parse(raw)
    if (sources.length > 0) {
      const scraped = await Promise.all(
        sources.map(async (src) => ({ label: src.label, text: await scrapeText(src.url) }))
      )
      const combinedText = scraped
        .filter((s) => s.text)
        .map((s) => `=== ${s.label} ===\n${s.text}`)
        .join('\n\n')
        .slice(0, 20000)

      if (combinedText) {
        const prompt = `你是旅遊達人。以下是旅遊參考網站的內容：\n${combinedText}\n\n請推薦其中的地點，分為三類：點心(dessert)、景點(attraction)、餐廳(restaurant)。每類最多 8 個。\n回傳純 JSON 陣列，格式：[{"name":"地點名稱","type":"dessert 或 attraction 或 restaurant","reason":"一句推薦理由（繁體中文）","sourceLabel":"來源標籤"}]`
        try {
          const rawResponse = await callClaude(prompt)
          const match = rawResponse.match(/\[[\s\S]*\]/)
          const parsed: Array<{ name: string; type: string; reason: string; sourceLabel: string }> =
            match ? JSON.parse(match[0]) : []
          const enriched = await Promise.all(
            parsed.map(async (p) => {
              const found = await searchPlace(p.name)
              if (!found) return null
              return {
                ...found,
                type: validateType(p.type),
                reason: p.reason,
                sourceLabel: p.sourceLabel,
              } satisfies DayRecommendation
            })
          )
          extracted = enriched.filter((x): x is DayRecommendation => x !== null)
        } catch {
          extracted = []
        }
      }
    }
  } catch {
    extracted = []
  }

  const cleaned = dedupeAndExclude(extracted, existingIds)
  const perDay = assignToDays(cleaned, days)
  const recommendedIds = new Set<string>(cleaned.map((r) => r.placeId))

  const result: RecommendationsByDay = []
  for (let i = 0; i < days.length; i++) {
    const websiteBuckets = bucketByCategory(perDay[i])
    const dayResult: CategoryBuckets = {
      dessert: splitShownReserve(websiteBuckets.dessert, REC_LIMIT),
      attraction: splitShownReserve(websiteBuckets.attraction, REC_LIMIT),
      restaurant: splitShownReserve(websiteBuckets.restaurant, REC_LIMIT),
    }
    const centroid = resolveDayCenter(days, i)

    if (centroid) {
      try {
        const missingCategories = REC_CATEGORIES.filter((category) => dayResult[category].shown.length < REC_LIMIT)
        const originalShownIdsByCategory = new Map<
          'dessert' | 'attraction' | 'restaurant',
          Set<string>
        >()
        const filledCategories = await Promise.all(missingCategories.map(async (category) => {
          originalShownIdsByCategory.set(
            category,
            new Set(dayResult[category].shown.map((item) => item.placeId))
          )
          const have = new Set<string>([
            ...Array.from(existingIds),
            ...Array.from(recommendedIds),
            ...REC_CATEGORIES.flatMap((c) => [
              ...dayResult[c].shown.map((x) => x.placeId),
              ...dayResult[c].reserve.map((x) => x.placeId),
            ]),
          ])
          const shown = [...dayResult[category].shown]
          await fillFromOpenPoiThenGoogle(shown, centroid, category, have)
          return { category, shown }
        }))

        const acceptedIds = new Set<string>([...Array.from(existingIds), ...Array.from(recommendedIds)])
        for (const { category, shown } of filledCategories) {
          const originalShownIds = originalShownIdsByCategory.get(category) ?? new Set<string>()
          const deduped = shown.filter((item) => {
            if (originalShownIds.has(item.placeId)) {
              acceptedIds.add(item.placeId)
              return true
            }
            if (acceptedIds.has(item.placeId)) return false
            acceptedIds.add(item.placeId)
            return true
          })
          dayResult[category] = { ...dayResult[category], shown: deduped }
        }
        REC_CATEGORIES.forEach((category) =>
          dayResult[category].shown.forEach((item) => recommendedIds.add(item.placeId))
        )
      } catch {
        // best-effort fill: leave this day's buckets as-is and continue
      }
    }

    result.push(dayResult)
  }

  return result
}

export async function refreshDayCategoryRecommendations(args: {
  category: 'dessert' | 'attraction' | 'restaurant'
  center: { lat: number; lng: number }
  excludeIds: string[]
  tripId?: string
}): Promise<DayRecommendation[]> {
  return runWithTripId(args.tripId, () => refreshDayCategoryRecommendationsImpl(args))
}

async function refreshDayCategoryRecommendationsImpl(args: {
  category: 'dessert' | 'attraction' | 'restaurant'
  center: { lat: number; lng: number }
  excludeIds: string[]
}): Promise<DayRecommendation[]> {
  const { category, center, excludeIds } = args
  const exclude = new Set(excludeIds)
  const out: DayRecommendation[] = []
  try {
    await fillFromOpenPoiThenGoogle(out, center, category, exclude)
  } catch {
    return []
  }
  return out
}

export async function fetchReplacementRecommendation(
  day: DayItinerary,
  category: 'dessert' | 'attraction' | 'restaurant',
  excludeIds: string[],
  tripId?: string
): Promise<DayRecommendation | null> {
  return runWithTripId(tripId, () => fetchReplacementRecommendationImpl(day, category, excludeIds))
}

async function fetchReplacementRecommendationImpl(
  day: DayItinerary,
  category: 'dessert' | 'attraction' | 'restaurant',
  excludeIds: string[]
): Promise<DayRecommendation | null> {
  const centroid = centroidOf(day.places)
  if (!centroid) return null
  const exclude = new Set(excludeIds)
  try {
    const openCandidates = await safeOpenPoiSearch(centroid.lat, centroid.lng, category)
    const openCandidate = openCandidates.find((candidate) => !exclude.has(candidate.placeId))
    if (openCandidate && hasRecommendationPhoto(openCandidate)) {
      return { ...openCandidate, type: category, reason: OPEN_POI_REASON, sourceLabel: OPEN_POI_SOURCE_LABEL }
    }

    const candidates = await nearbySearch(centroid.lat, centroid.lng, category)
    let fallbackGoogle: DayRecommendation | null = null
    for (const candidate of candidates) {
      if (exclude.has(candidate.placeId)) continue
      const place = await maybeEnrichRecommendationDetails(candidate, category)
      const recommendation = { ...place, reason: GOOGLE_REASON, sourceLabel: GOOGLE_SOURCE_LABEL }
      if (hasRecommendationPhoto(place)) return recommendation
      fallbackGoogle ??= recommendation
    }
    if (openCandidate) return { ...openCandidate, type: category, reason: OPEN_POI_REASON, sourceLabel: OPEN_POI_SOURCE_LABEL }
    return fallbackGoogle
  } catch {
    return null
  }
  return null
}
