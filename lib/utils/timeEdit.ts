import type { ScheduledPlace } from '@/lib/types'
import { checkOutsideHours, checkLateExit } from '@/lib/utils/hours'
import { isTimeAnchored } from '@/lib/utils/lockDerive'

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minsToTime(mins: number): string {
  const clamped = Math.max(0, Math.round(mins))
  return `${String(Math.floor(clamped / 60) % 24).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

// 依鎖狀態套用時間編輯。結束被釘、開始未釘時,改開始要保持結束不變(補償停留)。
export function applyTimeEdit(
  p: ScheduledPlace,
  field: 'startTime' | 'durationMin',
  value: string | number,
): ScheduledPlace {
  if (field === 'startTime' && p.endLocked && !p.startLocked && typeof value === 'string') {
    const oldEnd = toMin(p.startTime) + p.durationMin
    const newDur = oldEnd - toMin(value)
    return { ...p, startTime: value, durationMin: newDur > 0 ? newDur : p.durationMin }
  }
  return { ...p, [field]: value }
}

function withWarnings(p: ScheduledPlace, dateIso: string, dayStartMin: number): ScheduledPlace {
  const startMin = toMin(p.startTime)
  return {
    ...p,
    outsideHours: startMin < dayStartMin || checkOutsideHours(p.startTime, p.openingHours, dateIso),
    lateExit: checkLateExit(p.startTime, p.durationMin, p.openingHours, dateIso),
  }
}

// TASK-023: editing a card's start/duration makes it a soft anchor for this cascade
// (DEC-601) — no manual lock is set. The immediate previous neighbor's END aligns to
// the edited card's new START, preserving travel time (DEC-603); its own start never
// moves, only its duration (DEC-602: adjust end/duration, never the neighbor's start).
// If that alignment would go negative, clamp to end === its own start, duration 0
// (DEC-604). Everything after the edited card forward-cascades preserving each card's
// own duration, same as the existing between-locks fill in clientScheduler.ts. Explicit
// hard locks (startLocked/endLocked, effectively anchored) are never overwritten
// (DEC-606) — the immediate neighbor is skipped entirely if hard-anchored, and the
// forward cascade stops at / resumes after any hard-anchored card it encounters.
// Symmetric in both directions (DEC-605) since it's driven purely by minute arithmetic.
export function applyTimeEditCascade(
  places: ScheduledPlace[],
  placeId: string,
  field: 'startTime' | 'durationMin',
  value: string | number,
  dateIso: string,
  dayStartMin: number,
): ScheduledPlace[] {
  const editedIdx = places.findIndex((p) => p.id === placeId)
  if (editedIdx === -1) return places

  const result = [...places]
  result[editedIdx] = withWarnings(applyTimeEdit(result[editedIdx], field, value), dateIso, dayStartMin)

  if (editedIdx > 0) {
    const prev = result[editedIdx - 1]
    if (!isTimeAnchored(prev)) {
      const travel = prev.travelMinToNext ?? 0
      const targetEndMin = toMin(result[editedIdx].startTime) - travel
      const prevStartMin = toMin(prev.startTime)
      const newDuration = Math.max(0, targetEndMin - prevStartMin)
      result[editedIdx - 1] = withWarnings({ ...prev, durationMin: newDuration }, dateIso, dayStartMin)
    }
  }

  let cursor = toMin(result[editedIdx].startTime) + result[editedIdx].durationMin + (result[editedIdx].travelMinToNext ?? 0)
  for (let i = editedIdx + 1; i < result.length; i++) {
    const p = result[i]
    if (isTimeAnchored(p)) {
      cursor = toMin(p.startTime) + p.durationMin + (p.travelMinToNext ?? 0)
      continue
    }
    result[i] = withWarnings({ ...p, startTime: minsToTime(cursor) }, dateIso, dayStartMin)
    cursor += p.durationMin + (p.travelMinToNext ?? 0)
  }

  return result
}
