'use server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Source, ScheduledPlace, Recommendation } from '@/lib/types'
import { scrapeText } from './scrape'
import { verifyPlace, searchPlace, getPlaceDetails, nearbySearch } from './places'
import { validateType } from '@/lib/placeType'
import {
  REC_CATEGORIES, centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, capBuckets,
} from '@/lib/utils/dayRecommend'
import type { DayItinerary, DayRecommendation, RecommendationsByDay, CategoryBuckets } from '@/lib/types'
import { callClaude } from '@/lib/claude'

export async function getRecommendations(
  currentPlaces: ScheduledPlace[]
): Promise<Recommendation[]> {
  // Load sources
  const raw = await readFile(join(process.cwd(), 'config/sources.json'), 'utf-8')
  const sources: Source[] = JSON.parse(raw)
  if (sources.length === 0) return []

  // Scrape all sources in parallel
  const scraped = await Promise.all(
    sources.map(async (src) => ({
      label: src.label,
      text: await scrapeText(src.url),
    }))
  )
  const combinedText = scraped
    .filter((s) => s.text)
    .map((s) => `=== ${s.label} ===\n${s.text}`)
    .join('\n\n')
    .slice(0, 20000)

  if (!combinedText) return []

  const currentNames = currentPlaces.map((p) => p.name).join('、')
  const prompt = `你是旅遊達人。使用者目前行程中已有：${currentNames}\n\n以下是旅遊參考網站的內容：\n${combinedText}\n\n請從中推薦最多 8 個尚未在使用者行程中的餐廳或景點，考量地理相近性和行程風格。\n回傳純 JSON 陣列，格式：[{"name":"地點名稱","type":"restaurant 或 attraction","reason":"一句推薦理由（繁體中文）","sourceLabel":"來源標籤"}]`

  let recs: Array<{ name: string; type: string; reason: string; sourceLabel: string }> = []
  try {
    const rawResponse = await callClaude(prompt)
    const match = rawResponse.match(/\[[\s\S]*\]/)
    if (match) recs = JSON.parse(match[0])
  } catch {
    return []
  }

  // Verify each with Google Places
  const verified = await Promise.all(
    recs.map(async (r) => {
      const result = await verifyPlace(r.name)
      return {
        name: r.name,
        type: r.type === 'restaurant' ? 'restaurant' : 'attraction',
        reason: r.reason,
        sourceLabel: r.sourceLabel,
        placeId: result?.placeId ?? null,
        lat: result?.lat ?? null,
        lng: result?.lng ?? null,
        verified: !!result,
      } satisfies Recommendation
    })
  )
  return verified
}

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

  // --- 3. Per day: bucket, fill each category to REC_LIMIT, cap ---
  const result: RecommendationsByDay = []
  for (let i = 0; i < days.length; i++) {
    const buckets = bucketByCategory(perDay[i])
    const centroid = centroidOf(days[i].places) ?? centroidOf(days.flatMap((d) => d.places))

    if (centroid) {
      for (const cat of REC_CATEGORIES) {
        if (buckets[cat].length >= REC_LIMIT) continue
        const have = new Set<string>([
          ...existingIds,
          ...REC_CATEGORIES.flatMap((c) => buckets[c].map((x) => x.placeId)),
        ])
        const candidates = await nearbySearch(centroid.lat, centroid.lng, cat)
        for (const c of candidates) {
          if (buckets[cat].length >= REC_LIMIT) break
          if (have.has(c.placeId)) continue
          const detailed = await getPlaceDetails(c.placeId)
          const filled = detailed ? { ...detailed, type: cat } : c
          buckets[cat].push({ ...filled, reason: 'Google 高評分推薦', sourceLabel: 'Google 推薦' })
          have.add(c.placeId)
        }
      }
    }

    result.push(capBuckets(buckets, REC_LIMIT) as CategoryBuckets)
  }

  return result
}
