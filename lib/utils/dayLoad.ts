import type { DayItinerary, ScheduledPlace } from '@/lib/types'
import { timeToMin } from '@/lib/utils/time'

// Per-day load / balance (backlog #2). Measures how full a day is against its own
// activity window (dayEnd − dayStart), so a bar can show 太滿 / 剛好 / 太空 at a glance.

export type DayLoadState = 'empty' | 'light' | 'ok' | 'over'
export interface DayLoad {
  usedMin: number
  windowMin: number
  ratio: number
  state: DayLoadState
}

const LIGHT_RATIO = 0.5

// End of a place's active occupancy. A day-ending accommodation is stretched to
// fill the window (extendLastAccommodation), so counting its stretched end would
// make every hotel-ending day read 100% full — measure to its check-in start.
function activeEnd(p: ScheduledPlace): number {
  const start = timeToMin(p.startTime)
  return p.type === 'accommodation' ? start : start + p.durationMin
}

export function dayLoad(day: DayItinerary): DayLoad {
  const dayStartMin = timeToMin(day.dayStart)
  const dayEndMin = timeToMin(day.dayEnd)
  const windowMin = Math.max(0, dayEndMin - dayStartMin)

  if (day.places.length === 0) {
    return { usedMin: 0, windowMin, ratio: 0, state: 'empty' }
  }

  const end = Math.max(...day.places.map(activeEnd))
  const usedMin = Math.max(0, end - dayStartMin)
  const ratio = windowMin > 0 ? usedMin / windowMin : 0
  const state: DayLoadState = end > dayEndMin ? 'over' : ratio < LIGHT_RATIO ? 'light' : 'ok'

  return { usedMin, windowMin, ratio, state }
}
