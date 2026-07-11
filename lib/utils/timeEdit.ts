import type { ScheduledPlace } from '@/lib/types'

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
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
