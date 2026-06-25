'use server'
import type { DayItinerary } from '@/lib/types'
import { callClaude } from '@/lib/claude'

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
