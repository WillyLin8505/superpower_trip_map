import type { DayItinerary, ScheduledPlace, DayArrangeInputs, ArrangeOpts } from '@/lib/types'
import { recalcDay } from '@/lib/utils/clientScheduler'
import { levelAt } from '@/lib/crowd'
import { weekdayIndex } from '@/lib/utils/date'

const CROWD_PENALTY: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 600, high: 1800 }
const W_TRAVEL_WHEN_CROWD_ONLY = 0.2

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function travelSecs(aId: string, bId: string, inputs: DayArrangeInputs): number {
  const i = inputs.indices.indexOf(aId)
  const j = inputs.indices.indexOf(bId)
  if (i === -1 || j === -1) return 0
  return inputs.matrix[i][j]
}

function withRefreshedTravel(order: ScheduledPlace[], inputs: DayArrangeInputs): ScheduledPlace[] {
  return order.map((p, i) => ({
    ...p,
    travelMinToNext:
      i < order.length - 1 ? Math.round(travelSecs(p.placeId, order[i + 1].placeId, inputs) / 60) : null,
  }))
}

function totalTravelSecs(order: ScheduledPlace[], inputs: DayArrangeInputs): number {
  let s = 0
  for (let i = 0; i < order.length - 1; i++) s += travelSecs(order[i].placeId, order[i + 1].placeId, inputs)
  return s
}

function crowdPenalty(timed: ScheduledPlace[], inputs: DayArrangeInputs, weekday: number): number {
  let s = 0
  for (const p of timed) {
    const f = inputs.crowdByPlaceId[p.placeId]
    if (!f) continue
    const level = levelAt(f, weekday, Math.floor(toMin(p.startTime) / 60))
    if (level) s += CROWD_PENALTY[level]
  }
  return s
}

function cost(
  order: ScheduledPlace[],
  day: DayItinerary,
  dateIso: string,
  inputs: DayArrangeInputs,
  opts: ArrangeOpts
): number {
  const refreshed = withRefreshedTravel(order, inputs)
  // 時序以既有 recalcDay 計算（鎖定錨點、前後段排程的單一來源）
  const timedDay = recalcDay({ ...day, places: refreshed }, dateIso)
  const wTravel = opts.avoidTraffic ? 1.0 : opts.avoidCrowds ? W_TRAVEL_WHEN_CROWD_ONLY : 0
  const wCrowd = opts.avoidCrowds ? 1.0 : 0
  const travel = totalTravelSecs(order, inputs)
  const crowd = wCrowd ? crowdPenalty(timedDay.places, inputs, weekdayIndex(dateIso)) : 0
  return wTravel * travel + wCrowd * crowd
}

export function arrangeDayOrder(
  day: DayItinerary,
  dateIso: string,
  inputs: DayArrangeInputs,
  opts: ArrangeOpts
): ScheduledPlace[] {
  const places = day.places
  const unlocked = places.filter((p) => !p.startLocked)
  if (unlocked.length < 2 || (!opts.avoidTraffic && !opts.avoidCrowds)) {
    return withRefreshedTravel(places, inputs)
  }

  // 鎖定站固定於原索引；只在未鎖序列上做局部搜尋
  const lockedAt = new Map<number, ScheduledPlace>()
  places.forEach((p, i) => { if (p.startLocked) lockedAt.set(i, p) })
  const reconstruct = (unlockedOrder: ScheduledPlace[]): ScheduledPlace[] => {
    const out: ScheduledPlace[] = []
    let u = 0
    for (let i = 0; i < places.length; i++) {
      const locked = lockedAt.get(i)
      out.push(locked ?? unlockedOrder[u++])
    }
    return out
  }

  let bestUnlocked = unlocked
  let bestCost = cost(reconstruct(bestUnlocked), day, dateIso, inputs, opts)

  // 2-opt：僅接受嚴格改善 → 決定性（平手保留先前順序）
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < bestUnlocked.length - 1; i++) {
      for (let j = i + 1; j < bestUnlocked.length; j++) {
        const cand = [
          ...bestUnlocked.slice(0, i),
          ...bestUnlocked.slice(i, j + 1).reverse(),
          ...bestUnlocked.slice(j + 1),
        ]
        const c = cost(reconstruct(cand), day, dateIso, inputs, opts)
        if (c < bestCost - 1e-9) {
          bestUnlocked = cand
          bestCost = c
          improved = true
        }
      }
    }
  }

  return withRefreshedTravel(reconstruct(bestUnlocked), inputs)
}
