import type { ScheduledPlace } from '@/lib/types'
import { minsToTime } from '@/lib/utils/time'

export interface FreeBlock {
  afterId: string
  minutes: number
  untilTime?: string
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`
}

export function freeBlocks(
  places: ScheduledPlace[],
  dayEndMin: number,
  minGapMin = 15
): FreeBlock[] {
  if (places.length === 0) return []
  const out: FreeBlock[] = []
  for (let i = 0; i < places.length - 1; i++) {
    const cur = places[i]
    const next = places[i + 1]
    const gap = toMin(next.startTime) - (toMin(cur.startTime) + cur.durationMin + (cur.travelMinToNext ?? 0))
    if (gap >= minGapMin) out.push({ afterId: cur.id, minutes: gap })
  }
  const last = places[places.length - 1]
  const remaining = dayEndMin - (toMin(last.startTime) + last.durationMin)
  if (remaining >= minGapMin) out.push({ afterId: last.id, minutes: remaining, untilTime: minsToTime(dayEndMin) })
  return out
}
