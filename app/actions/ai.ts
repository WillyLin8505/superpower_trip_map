'use server'
import { spawn } from 'child_process'
import type { DayItinerary } from '@/lib/types'

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt])
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `exit ${code}`))
      else resolve(out.trim())
    })
    child.on('error', reject)
  })
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
        // Extract JSON from response (model may add markdown fences)
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
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
        // Claude unavailable — return day unchanged
        return day
      }
    })
  )
  return enriched
}
