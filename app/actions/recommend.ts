'use server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Source, ScheduledPlace, Recommendation } from '@/lib/types'
import { scrapeText } from './scrape'
import { verifyPlace } from './places'
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
