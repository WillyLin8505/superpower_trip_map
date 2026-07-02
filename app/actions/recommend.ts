'use server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Source } from '@/lib/types'
import { scrapeText } from './scrape'
import { searchPlace, getPlaceDetails, nearbySearch } from './places'
import { validateType } from '@/lib/placeType'
import { REC_CATEGORIES, centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, splitShownReserve } from '@/lib/utils/dayRecommend'
import type { DayItinerary, DayRecommendation, RecommendationsByDay, CategoryBuckets } from '@/lib/types'
import { callClaude } from '@/lib/claude'

const REC_LIMIT = 5

export async function getDayRecommendations(
  days: DayItinerary[]
): Promise<RecommendationsByDay> {
  const existingIds = new Set(days.flatMap((d) => d.places.map((p) => p.placeId)))

  // --- 1. Website extractions (best-effort) ---
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
    extracted = []   // missing/invalid sources.json → Google fill only
  }

  // --- 2. Assign to closest day ---
  const cleaned = dedupeAndExclude(extracted, existingIds)
  const perDay = assignToDays(cleaned, days)

  // --- 3. Per day: split website picks into shown/reserve, fill shown to REC_LIMIT ---
  // Trip-wide dedup: seed with every extracted placeId so fills never duplicate extractions from other days
  const recommendedIds = new Set<string>(cleaned.map((r) => r.placeId))

  const result: RecommendationsByDay = []
  for (let i = 0; i < days.length; i++) {
    const websiteBuckets = bucketByCategory(perDay[i])   // CategoryArrays (website-only)
    const dayResult: CategoryBuckets = {
      dessert: splitShownReserve(websiteBuckets.dessert, REC_LIMIT),
      attraction: splitShownReserve(websiteBuckets.attraction, REC_LIMIT),
      restaurant: splitShownReserve(websiteBuckets.restaurant, REC_LIMIT),
    }
    const centroid = centroidOf(days[i].places) ?? centroidOf(days.flatMap((d) => d.places))

    if (centroid) {
      try {
        for (const cat of REC_CATEGORIES) {
          if (dayResult[cat].shown.length >= REC_LIMIT) continue
          const have = new Set<string>([
            ...Array.from(existingIds),
            ...Array.from(recommendedIds),
            ...REC_CATEGORIES.flatMap((c) => [
              ...dayResult[c].shown.map((x) => x.placeId),
              ...dayResult[c].reserve.map((x) => x.placeId),
            ]),
          ])
          const candidates = await nearbySearch(centroid.lat, centroid.lng, cat)
          for (const c of candidates) {
            if (dayResult[cat].shown.length >= REC_LIMIT) break
            if (have.has(c.placeId)) continue
            const detailed = await getPlaceDetails(c.placeId)
            const filled = detailed ? { ...detailed, type: cat } : c
            dayResult[cat].shown.push({ ...filled, reason: 'Google 高評分推薦', sourceLabel: 'Google 推薦' })
            have.add(c.placeId)
            recommendedIds.add(c.placeId)
          }
        }
      } catch {
        // best-effort fill: leave this day's buckets as-is and continue
      }
    }

    result.push(dayResult)
  }

  return result
}

export async function fetchReplacementRecommendation(
  day: DayItinerary,
  category: 'dessert' | 'attraction' | 'restaurant',
  excludeIds: string[]
): Promise<DayRecommendation | null> {
  const centroid = centroidOf(day.places)
  if (!centroid) return null
  const exclude = new Set(excludeIds)
  try {
    const candidates = await nearbySearch(centroid.lat, centroid.lng, category)
    for (const c of candidates) {
      if (exclude.has(c.placeId)) continue
      const detailed = await getPlaceDetails(c.placeId)
      const place = detailed ? { ...detailed, type: category } : c
      return { ...place, reason: 'Google 高評分推薦', sourceLabel: 'Google 推薦' }
    }
  } catch {
    return null
  }
  return null
}
