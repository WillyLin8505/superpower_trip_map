import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'
import { checkLateExit, checkOutsideHours } from '@/lib/utils/hours'
import { dayDate } from '@/lib/utils/date'
import { minsToTime } from '@/lib/utils/time'
import { isTimeAnchored, effectivePinned } from '@/lib/utils/lockDerive'

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function applyWarnings(p: ScheduledPlace, startTime: string, startMin: number, dateIso: string, dayStartMin: number): ScheduledPlace {
  return {
    ...p,
    startTime,
    outsideHours: startMin < dayStartMin || checkOutsideHours(startTime, p.openingHours, dateIso),
    lateExit: checkLateExit(startTime, p.durationMin, p.openingHours, dateIso),
  }
}

// 智慧排程用：把當天第 1 間餐廳排進午餐窗、第 2 間排進晚餐窗，與 fillDay 規則一致。
// 用「彈性用餐窗」而非硬性單點：午餐 11:00–13:00、晚餐 17:00–19:00（理想 12:00/18:00，
// ±1 小時皆可）。只有當餐廳落在窗「之前」才推到窗起點；已在窗內或更晚就不動，也永遠
// 不會比原本的順序時間更早。餐廳「第幾間」以整天位置預先編號(見 recalcDay 的 mealRank)，
// 跨區段/有鎖定日仍正確。只有 snapMeals 開啟(目前僅「智慧排程」動作)才生效。
const LUNCH_START = 11 * 60   // 午餐窗起點
const DINNER_START = 17 * 60  // 晚餐窗起點
interface MealSnap { snap: boolean; rank: Map<string, number> }

function scheduleForward(places: ScheduledPlace[], startMin: number, dateIso: string, dayStartMin: number, meal?: MealSnap): ScheduledPlace[] {
  let cursor = startMin
  return places.map((p) => {
    if (meal?.snap && p.type === 'restaurant') {
      const rank = meal.rank.get(p.id)
      if (rank === 0 && cursor < LUNCH_START) cursor = LUNCH_START
      else if (rank === 1 && cursor < DINNER_START) cursor = DINNER_START
    }
    const startTime = minsToTime(cursor)
    const result = applyWarnings(p, startTime, cursor, dateIso, dayStartMin)
    cursor += p.durationMin + (p.travelMinToNext ?? 0)
    return result
  })
}

function scheduleBackwards(places: ScheduledPlace[], nextStartMin: number, dateIso: string, dayStartMin: number): ScheduledPlace[] {
  // nextStartMin = start time of the thing that comes after this segment (e.g. a locked place's startMin)
  // For each card in reverse: startMin = cursor - durationMin - travelMinToNext; cursor = startMin
  let cursor = nextStartMin
  return [...places].reverse().map((p) => {
    const startMin = cursor - p.durationMin - (p.travelMinToNext ?? 0)
    const startTime = minsToTime(Math.max(0, startMin))
    cursor = startMin
    return applyWarnings(p, startTime, startMin, dateIso, dayStartMin)
  }).reverse()
}

function extendLastAccommodation(places: ScheduledPlace[], dayEndMin: number): ScheduledPlace[] {
  if (places.length === 0) return places
  const lastIdx = places.length - 1
  const last = places[lastIdx]
  if (last.type !== 'accommodation' || last.durationLocked || effectivePinned(last).end) return places
  const startMin = toMin(last.startTime)
  if (startMin >= dayEndMin) return places
  return places.map((p, i) => (i === lastIdx ? { ...p, durationMin: dayEndMin - startMin } : p))
}

export function recalcDay(day: DayItinerary, dateIso: string, opts?: { snapMeals?: boolean }): DayItinerary {
  const places = day.places
  const dayStartMin = toMin(day.dayStart)
  const dayEndMin = toMin(day.dayEnd)
  const lockIndices = places.reduce<number[]>((acc, p, i) => (isTimeAnchored(p) ? [...acc, i] : acc), [])
  // Number restaurants by their position in the whole day (keyed by the unique card id,
  // since placeId can repeat). Position-based rank stays correct even when the day is
  // scheduled in out-of-order segments (leading backward + per-lock forward), so meal
  // snapping now works on days with time-locked anchors too — a locked place keeps its
  // time but still consumes a rank.
  const mealRank = new Map<string, number>()
  if (opts?.snapMeals) {
    let n = 0
    for (const p of places) if (p.type === 'restaurant') mealRank.set(p.id, n++)
  }
  const meal: MealSnap = { snap: opts?.snapMeals ?? false, rank: mealRank }

  if (lockIndices.length === 0) {
    return { ...day, places: extendLastAccommodation(scheduleForward(places, dayStartMin, dateIso, dayStartMin, meal), dayEndMin) }
  }

  const result: ScheduledPlace[] = [...places]

  // Leading segment: backwards from first lock's startTime
  const firstLockIdx = lockIndices[0]
  if (firstLockIdx > 0) {
    const leading = places.slice(0, firstLockIdx)
    const scheduled = scheduleBackwards(leading, toMin(places[firstLockIdx].startTime), dateIso, dayStartMin)
    scheduled.forEach((p, i) => { result[i] = p })
  }

  // Locked places: keep startTime + durationMin, recompute warnings
  lockIndices.forEach((idx) => {
    const p = places[idx]
    const startTime = p.startTime
    result[idx] = {
      ...p,
      outsideHours: toMin(startTime) < dayStartMin || checkOutsideHours(startTime, p.openingHours, dateIso),
      lateExit: checkLateExit(startTime, p.durationMin, p.openingHours, dateIso),
    }
  })

  // Segments after each lock (between locks and trailing): forward from lock's end
  lockIndices.forEach((lockIdx, k) => {
    const nextLockPosInList = lockIndices[k + 1]
    const nextLockIdx = nextLockPosInList ?? places.length
    const segment = places.slice(lockIdx + 1, nextLockIdx)
    if (segment.length === 0) return
    const lock = places[lockIdx]
    const lockEndMin = toMin(lock.startTime) + lock.durationMin + (lock.travelMinToNext ?? 0)
    let scheduled = scheduleForward(segment, lockEndMin, dateIso, dayStartMin, meal)

    // cap check — flag overflow if segment spills past the next lock
    if (nextLockPosInList !== undefined) {
      const nextLockStartMin = toMin(places[nextLockPosInList].startTime)
      scheduled = scheduled.map(p => {
        const pStartMin = toMin(p.startTime)
        return pStartMin >= nextLockStartMin ? { ...p, outsideHours: true } : p
      })
    }

    scheduled.forEach((p, i) => { result[lockIdx + 1 + i] = p })
  })

  return { ...day, places: extendLastAccommodation(result, dayEndMin) }
}

export function recalcPlan(plan: PlanResult): PlanResult {
  return { ...plan, days: plan.days.map((d) => recalcDay(d, dayDate(plan.startDate, d.day))) }
}
