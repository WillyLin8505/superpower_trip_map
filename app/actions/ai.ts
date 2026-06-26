'use server'
import type { DayItinerary, PlaceType } from '@/lib/types'
import { callClaude } from '@/lib/claude'

export interface ExtractedItinerary {
  country: string | null
  countryCode: string | null
  places: Array<{ name: string; type: PlaceType }>
}

export async function extractItinerary(text: string): Promise<ExtractedItinerary> {
  const prompt = `你是旅遊助理。以下是一段旅遊行程文字。請：
1. 找出所有景點和餐廳名稱
2. 判斷每個地點是景點(attraction)還是餐廳(restaurant)
3. 判斷行程的國家（例如 Taiwan、Japan、South Korea）

回傳純 JSON，不要包含 markdown 或其他說明：
{
  "country": "Japan",
  "countryCode": "jp",
  "places": [
    { "name": "地點名稱", "type": "attraction" }
  ]
}

若無法判斷國家，country 和 countryCode 設為 null。
若無法判斷地點類型，設為 attraction。

行程文字：
${text}`

  try {
    const raw = await callClaude(prompt)
    const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) return { country: null, countryCode: null, places: [] }
    const parsed = JSON.parse(match[0])
    return {
      country: parsed.country ?? null,
      countryCode: parsed.countryCode ?? null,
      places: Array.isArray(parsed.places) ? parsed.places : [],
    }
  } catch {
    return { country: null, countryCode: null, places: [] }
  }
}

interface AiDayResult {
  summary: string
  descriptions: Record<string, string>  // place name → 1-sentence description
}

export async function generateDaySummaries(
  days: DayItinerary[]
): Promise<DayItinerary[]> {
  const enriched = await Promise.all(
    days.map(async (day) => {
      const placeList = day.places
        .map((p) => `- ${p.name}（${p.type === 'attraction' ? '景點' : '餐廳'}，停留 ${p.durationMin} 分鐘）`)
        .join('\n')

      const prompt = `你是旅遊達人。以下是第 ${day.day} 天的行程：\n${placeList}\n\n請用繁體中文回答，回傳純 JSON，格式如下：\n{"summary":"50字以內的今日行程摘要","descriptions":{"地點名稱":"一句特色介紹"}}`

      try {
        const raw = await callClaude(prompt)
        // Strip markdown code fences if present, then find JSON object
        const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
        const jsonMatch = stripped.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('no JSON in response')
        const parsed: AiDayResult = JSON.parse(jsonMatch[0])

        return {
          ...day,
          aiSummary: parsed.summary ?? null,
          places: day.places.map((p) => ({
            ...p,
            aiDescription: parsed.descriptions?.[p.name] ?? null,
          })),
        }
      } catch {
        // Claude unavailable or response unparseable — return day unchanged
        return day
      }
    })
  )
  return enriched
}
