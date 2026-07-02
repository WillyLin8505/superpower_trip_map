import type { PlanResult, ScheduledPlace } from '@/lib/types'

export type Change =
  | { id: string; day: number; kind: 'move'; placeId: string; placeName: string; toDay: number }
  | { id: string; day: number; kind: 'duration'; placeId: string; placeName: string; from: number; to: number }
  | { id: string; day: number; kind: 'window'; field: 'dayStart' | 'dayEnd'; from: string; to: string }

function placeDayMap(plan: PlanResult): Map<string, number> {
  const m = new Map<string, number>()
  plan.days.forEach((d) => d.places.forEach((p) => m.set(p.placeId, d.day)))
  return m
}
function findPlace(plan: PlanResult, placeId: string): ScheduledPlace | undefined {
  for (const d of plan.days) {
    const p = d.places.find((x) => x.placeId === placeId)
    if (p) return p
  }
  return undefined
}

export function diffPlan(current: PlanResult, proposed: PlanResult): Change[] {
  const changes: Change[] = []
  const curDay = placeDayMap(current)
  const propDay = placeDayMap(proposed)

  for (const d of current.days) {
    for (const p of d.places) {
      const from = curDay.get(p.placeId) ?? d.day
      const to = propDay.get(p.placeId)
      if (to !== undefined && to !== from) {
        changes.push({ id: `move-${p.placeId}`, day: from, kind: 'move', placeId: p.placeId, placeName: p.name, toDay: to })
      }
      const pp = findPlace(proposed, p.placeId)
      if (pp && !p.durationLocked && pp.durationMin !== p.durationMin) {
        changes.push({ id: `dur-${p.placeId}`, day: from, kind: 'duration', placeId: p.placeId, placeName: p.name, from: p.durationMin, to: pp.durationMin })
      }
    }
  }

  for (const cd of current.days) {
    const pd = proposed.days.find((x) => x.day === cd.day)
    if (!pd) continue
    if (pd.dayStart !== cd.dayStart) {
      changes.push({ id: `win-${cd.day}-dayStart`, day: cd.day, kind: 'window', field: 'dayStart', from: cd.dayStart, to: pd.dayStart })
    }
    if (pd.dayEnd !== cd.dayEnd) {
      changes.push({ id: `win-${cd.day}-dayEnd`, day: cd.day, kind: 'window', field: 'dayEnd', from: cd.dayEnd, to: pd.dayEnd })
    }
  }
  return changes
}

export function applyChanges(current: PlanResult, accepted: Change[]): PlanResult {
  const days = current.days.map((d) => ({ ...d, places: d.places.map((p) => ({ ...p })) }))
  const byDay = new Map(days.map((d) => [d.day, d]))

  for (const c of accepted) {
    if (c.kind === 'duration') {
      for (const d of days) {
        const p = d.places.find((x) => x.placeId === c.placeId)
        if (p && !p.durationLocked) p.durationMin = c.to
      }
    }
  }
  for (const c of accepted) {
    if (c.kind === 'window') {
      const d = byDay.get(c.day)
      if (d) {
        if (c.field === 'dayStart') d.dayStart = c.to
        else d.dayEnd = c.to
      }
    }
  }
  for (const c of accepted) {
    if (c.kind === 'move') {
      let moved: ScheduledPlace | undefined
      for (const d of days) {
        const idx = d.places.findIndex((x) => x.placeId === c.placeId)
        if (idx !== -1) { moved = d.places.splice(idx, 1)[0]; break }
      }
      const target = byDay.get(c.toDay)
      if (moved && target) target.places.push(moved)
    }
  }
  return { ...current, days }
}
