// lib/utils/timeline.ts
import type { ScheduledPlace } from '@/lib/types'

export const PX_PER_MIN = 1.2
export const MIN_CARD_PX = 36
export const RESIZE_SNAP_MIN = 5
export const MIN_DURATION_MIN = 5

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export interface TimelineCardLayout {
  id: string
  heightPx: number
  travelGapPx: number
  travelMin: number
}

export interface TimelineLayout {
  dayStartMin: number
  dayEndMin: number
  totalPx: number
  cards: TimelineCardLayout[]
}

export function timelineLayout(places: ScheduledPlace[], pxPerMin: number = PX_PER_MIN): TimelineLayout {
  if (places.length === 0) {
    return { dayStartMin: 0, dayEndMin: 0, totalPx: 0, cards: [] }
  }
  const dayStartMin = toMin(places[0].startTime)
  const last = places[places.length - 1]
  const dayEndMin = toMin(last.startTime) + last.durationMin
  let totalPx = 0
  const cards = places.map((p, i) => {
    const heightPx = Math.max(p.durationMin * pxPerMin, MIN_CARD_PX)
    const travelMin = i < places.length - 1 ? (p.travelMinToNext ?? 0) : 0
    const travelGapPx = travelMin * pxPerMin
    totalPx += heightPx + travelGapPx
    return { id: p.id, heightPx, travelGapPx, travelMin }
  })
  return { dayStartMin, dayEndMin, totalPx, cards }
}

export function pxToDuration(currentDurationMin: number, deltaPx: number, pxPerMin: number = PX_PER_MIN): number {
  const raw = currentDurationMin + deltaPx / pxPerMin
  const snapped = Math.round(raw / RESIZE_SNAP_MIN) * RESIZE_SNAP_MIN
  return Math.max(MIN_DURATION_MIN, snapped)
}

export function rulerTicks(
  dayStartMin: number,
  dayEndMin: number,
  pxPerMin: number = PX_PER_MIN
): { min: number; topPx: number; label: string }[] {
  const ticks: { min: number; topPx: number; label: string }[] = []
  const first = (Math.floor(dayStartMin / 60) + 1) * 60
  for (let m = first; m <= dayEndMin; m += 60) {
    const h = Math.floor(m / 60)
    ticks.push({ min: m, topPx: (m - dayStartMin) * pxPerMin, label: `${String(h).padStart(2, '0')}:00` })
  }
  return ticks
}
