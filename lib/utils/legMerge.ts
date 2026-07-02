import type { ScheduledPlace, LegDefault } from '@/lib/types'

export function legMerge(places: ScheduledPlace[], legPlan: LegDefault[]): ScheduledPlace[] {
  return places.map((p, i) => {
    if (i === places.length - 1) {
      return { ...p, legMode: undefined, travelMinToNext: null, legManualNext: undefined }
    }
    const next = places[i + 1]
    // 手動段且相鄰未變 → 保留（同一對站 → 距離時間不變）
    if (p.legManualNext && p.legManualNext === next.id) {
      return p
    }
    const def = legPlan[i]
    return { ...p, legMode: def.legMode, travelMinToNext: def.travelMin, legManualNext: undefined }
  })
}
