'use server'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'
import { callClaude } from '@/lib/claude'
import { diffPlan, type Change } from '@/lib/utils/rearrangeChanges'

export type RearrangeResult =
  | { ok: true; changes: Change[]; summary: string }
  | { ok: false; error: string }

const ERR = 'AI 重排失敗，請換個說法再試'

interface AiDay { day: number; dayStart: string; dayEnd: string; places: Array<{ ref: number; durationMin: number }> }

// 單一地點停留時間上限:一整天(24h)。超過即視為 AI 亂數,拒絕。
const MAX_DURATION_MIN = 24 * 60

function isHHMM(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

function buildProposed(current: PlanResult, refPlaces: ScheduledPlace[], aiDays: unknown): PlanResult | null {
  if (!Array.isArray(aiDays) || aiDays.length !== current.days.length) return null
  const N = refPlaces.length
  const seen = new Set<number>()
  const newDays: DayItinerary[] = []
  for (let i = 0; i < aiDays.length; i++) {
    const ad = aiDays[i] as AiDay
    if (!isHHMM(ad?.dayStart) || !isHHMM(ad?.dayEnd) || !Array.isArray(ad?.places)) return null
    const places: ScheduledPlace[] = []
    for (const ap of ad.places) {
      if (typeof ap?.ref !== 'number' || ap.ref < 1 || ap.ref > N || seen.has(ap.ref)) return null
      if (typeof ap?.durationMin !== 'number' || ap.durationMin <= 0 || ap.durationMin > MAX_DURATION_MIN) return null
      seen.add(ap.ref)
      const base = refPlaces[ap.ref - 1]
      places.push({ ...base, durationMin: base.durationLocked ? base.durationMin : ap.durationMin })
    }
    const curDay = current.days[i]
    newDays.push({ ...curDay, dayStart: ad.dayStart, dayEnd: ad.dayEnd, places })
  }
  if (seen.size !== N) return null
  return { ...current, days: newDays }
}

export async function rearrangeItinerary(plan: PlanResult, instruction: string): Promise<RearrangeResult> {
  const refPlaces: ScheduledPlace[] = plan.days.flatMap((d) => d.places)
  const dayOfPlace = new Map<string, number>()
  plan.days.forEach((d) => d.places.forEach((p) => dayOfPlace.set(p.placeId, d.day)))

  const refLines = refPlaces.map((p, i) => {
    const locks = [p.startLocked ? '鎖開始' : '', p.durationLocked ? '鎖停留' : ''].filter(Boolean).join('/')
    return `${i + 1}. ${p.name}（${p.type}，第${dayOfPlace.get(p.placeId)}天，停留${p.durationMin}分${locks ? '，' + locks : ''}）`
  }).join('\n')
  const dayLines = plan.days.map((d) => `第${d.day}天 活動窗 ${d.dayStart}-${d.dayEnd}`).join('\n')

  const prompt = `你是旅遊行程助理。以下是目前行程，每個地點有編號 ref：
${refLines}

各天活動窗：
${dayLines}

使用者指令：「${instruction}」

規則：只能把現有地點移到不同天、改停留時長、改活動窗；不可新增/刪除地點，不可增減天數。標「鎖停留」者不要改停留時長，「鎖開始」者盡量不要移動。ref 必須恰好是 1 到 ${refPlaces.length} 各出現一次。

只回傳純 JSON（不要 markdown）：
{"summary":"一句話說明你做了什麼","days":[{"day":1,"dayStart":"09:00","dayEnd":"21:00","places":[{"ref":1,"durationMin":90}]}]}`

  let raw: string
  try {
    raw = await callClaude(prompt)
  } catch {
    return { ok: false, error: ERR }
  }
  try {
    const stripped = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim()
    const match = stripped.match(/\{[\s\S]*\}/)
    if (!match) return { ok: false, error: ERR }
    const parsed = JSON.parse(match[0]) as { summary?: string; days?: unknown }
    const proposed = buildProposed(plan, refPlaces, parsed.days)
    if (!proposed) return { ok: false, error: ERR }
    return { ok: true, changes: diffPlan(plan, proposed), summary: parsed.summary ?? '' }
  } catch {
    return { ok: false, error: ERR }
  }
}
