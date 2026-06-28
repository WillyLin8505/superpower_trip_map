import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'
import { checkLateExit, checkOutsideHours } from '@/lib/utils/hours'
import { minsToTime } from '@/lib/utils/time'

const DAY_START = 9 * 60

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function applyWarnings(p: ScheduledPlace, startTime: string, startMin: number): ScheduledPlace {
  return {
    ...p,
    startTime,
    outsideHours: startMin < DAY_START || checkOutsideHours(startTime, p.openingHours),
    lateExit: checkLateExit(startTime, p.durationMin, p.openingHours),
  }
}

function scheduleForward(places: ScheduledPlace[], startMin: number): ScheduledPlace[] {
  let cursor = startMin
  return places.map((p) => {
    const startTime = minsToTime(cursor)
    const result = applyWarnings(p, startTime, cursor)
    cursor += p.durationMin + (p.travelMinToNext ?? 0)
    return result
  })
}

function scheduleBackwards(places: ScheduledPlace[], nextStartMin: number): ScheduledPlace[] {
  // nextStartMin = start time of the thing that comes after this segment (e.g. a locked place's startMin)
  // For each card in reverse: startMin = cursor - durationMin - travelMinToNext; cursor = startMin
  let cursor = nextStartMin
  return [...places].reverse().map((p) => {
    const startMin = cursor - p.durationMin - (p.travelMinToNext ?? 0)
    const startTime = minsToTime(Math.max(0, startMin))
    cursor = startMin
    return applyWarnings(p, startTime, startMin)
  }).reverse()
}

function recalcDay(day: DayItinerary): DayItinerary {
  const places = day.places
  const lockIndices = places.reduce<number[]>((acc, p, i) => (p.startLocked ? [...acc, i] : acc), [])

  if (lockIndices.length === 0) {
    return { ...day, places: scheduleForward(places, DAY_START) }
  }

  const result: ScheduledPlace[] = [...places]

  // Leading segment: backwards from first lock's startTime
  const firstLockIdx = lockIndices[0]
  if (firstLockIdx > 0) {
    const leading = places.slice(0, firstLockIdx)
    const scheduled = scheduleBackwards(leading, toMin(places[firstLockIdx].startTime))
    scheduled.forEach((p, i) => { result[i] = p })
  }

  // Locked places: keep startTime + durationMin, recompute warnings
  lockIndices.forEach((idx) => {
    const p = places[idx]
    const startTime = p.startTime
    result[idx] = {
      ...p,
      outsideHours: toMin(startTime) < DAY_START || checkOutsideHours(startTime, p.openingHours),
      lateExit: checkLateExit(startTime, p.durationMin, p.openingHours),
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
    let scheduled = scheduleForward(segment, lockEndMin)

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

  return { ...day, places: result }
}

export function recalcPlan(plan: PlanResult): PlanResult {
  return { ...plan, days: plan.days.map(recalcDay) }
}
