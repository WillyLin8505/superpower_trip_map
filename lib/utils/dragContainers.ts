import type { DayItinerary, PlanResult } from '@/lib/types'

export function findContainer(id: string, days: DayItinerary[]): number {
  if (id.startsWith('day-')) return parseInt(id.replace('day-', ''), 10)
  return days.findIndex((day) => day.places.some((p) => p.id === id))
}

export function applyDragResult(
  plan: PlanResult,
  activeId: string,
  overId: string
): PlanResult {
  const sourceDayIdx = findContainer(activeId, plan.days)
  const targetDayIdx = findContainer(overId, plan.days)
  if (sourceDayIdx === -1 || targetDayIdx === -1) return plan

  const sourceDay = plan.days[sourceDayIdx]
  const targetDay = plan.days[targetDayIdx]

  if (sourceDayIdx === targetDayIdx) {
    const oldIdx = sourceDay.places.findIndex((p) => p.id === activeId)
    const newIdx = sourceDay.places.findIndex((p) => p.id === overId)
    if (oldIdx === newIdx || newIdx === -1) return plan
    const places = [...sourceDay.places]
    const [moved] = places.splice(oldIdx, 1)
    places.splice(newIdx, 0, moved)
    const newPlaces = places.map((p) => ({ ...p, travelMinToNext: null }))
    return {
      ...plan,
      days: plan.days.map((d, i) =>
        i === sourceDayIdx ? { ...d, places: newPlaces } : d
      ),
    }
  }

  // cross-day move
  const movedPlace = sourceDay.places.find((p) => p.id === activeId)
  if (!movedPlace) return plan
  const newSourcePlaces = sourceDay.places
    .filter((p) => p.id !== activeId)
    .map((p) => ({ ...p, travelMinToNext: null as null }))

  let newTargetPlaces: typeof targetDay.places
  if (overId.startsWith('day-')) {
    newTargetPlaces = [
      ...targetDay.places.map((p) => ({ ...p, travelMinToNext: null as null })),
      { ...movedPlace, travelMinToNext: null },
    ]
  } else {
    const overIdx = targetDay.places.findIndex((p) => p.id === overId)
    const insertIdx = overIdx === -1 ? targetDay.places.length : overIdx
    const arr = targetDay.places.map((p) => ({ ...p, travelMinToNext: null as null }))
    arr.splice(insertIdx, 0, { ...movedPlace, travelMinToNext: null })
    newTargetPlaces = arr
  }

  return {
    ...plan,
    days: plan.days.map((d, i) => {
      if (i === sourceDayIdx) return { ...d, places: newSourcePlaces }
      if (i === targetDayIdx) return { ...d, places: newTargetPlaces }
      return d
    }),
  }
}
