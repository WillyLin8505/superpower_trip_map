'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { CollisionDetection, DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { PlanResult, ScheduledPlace, Place, PlaceType, RecommendationsByDay, DayRecommendation } from '@/lib/types'
import { recalcPlan } from '@/lib/utils/clientScheduler'
import { daysBetween, dayDate } from '@/lib/utils/date'
import { ItineraryDay } from '@/components/ItineraryDay'
import { ItineraryCard } from '@/components/ItineraryCard'
import { getDayRecommendations } from '@/app/actions/recommend'
import { applyDragResult, findContainer } from '@/lib/utils/dragContainers'
import { findClosestDay } from '@/lib/utils/geo'
import { CombinedInput } from '@/components/CombinedInput'
import { DWELL } from '@/lib/placeType'

// pointerWithin is essential for multi-container: it checks where the pointer
// physically is, not center-to-center distance (closestCenter favors the source container)
const multiContainerCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

// Pure helper — no component state, so defined at module level to avoid exhaustive-deps churn
function renumberDays<T extends { day: number }>(days: T[]): T[] {
  return days.map((d, i) => ({ ...d, day: i + 1 }))
}

interface Props {
  initial: PlanResult
}

export function ItineraryClient({ initial }: Props) {
  const [plan, setPlan] = useState<PlanResult>(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [targetDays, setTargetDays] = useState<number | null>(null)
  const [recsByDay, setRecsByDay] = useState<RecommendationsByDay | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // planRef always tracks the latest committed plan (avoids stale closures in dnd-kit callbacks)
  const planRef = useRef<PlanResult>(initial)
  const savedPlanRef = useRef<PlanResult>(initial)
  // true when onDragOver fired for a cross-container move; needed to detect cross-day drag in onDragEnd
  const didCrossRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    let active = true
    getDayRecommendations(planRef.current.days)
      .then((r) => { if (active) setRecsByDay(r) })
      .catch(() => { if (active) setRecsByDay(null) })
    return () => { active = false }
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleRecalc = useCallback((nextPlan: PlanResult) => {
    planRef.current = nextPlan
    setPlan(nextPlan)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const recalced = recalcPlan(planRef.current)
      planRef.current = recalced
      setPlan(recalced)
    }, 2000)
  }, [])

  const toggleLockField = useCallback((dayIdx: number, placeId: string, field: 'startLocked' | 'durationLocked') => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        places: d.places.map((p) =>
          p.id === placeId ? { ...p, [field]: !p[field] } : p
        ),
      }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleToggleStartLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'startLocked'),
    [toggleLockField]
  )
  const handleToggleDurationLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'durationLocked'),
    [toggleLockField]
  )

  const setDayLockField = useCallback((dayIdx: number, field: 'startLocked' | 'durationLocked', locked: boolean) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return { ...d, places: d.places.map((p) => ({ ...p, [field]: locked })) }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleSetDayStartLock = useCallback(
    (dayIdx: number, locked: boolean) => setDayLockField(dayIdx, 'startLocked', locked),
    [setDayLockField]
  )
  const handleSetDayDurationLock = useCallback(
    (dayIdx: number, locked: boolean) => setDayLockField(dayIdx, 'durationLocked', locked),
    [setDayLockField]
  )

  const handleChangeType = useCallback((dayIdx: number, placeId: string, type: PlaceType) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        places: d.places.map((p) =>
          p.id === placeId ? { ...p, type } : p
        ),
      }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
    savedPlanRef.current = planRef.current
    didCrossRef.current = false
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setPlan(prev => {
      const sourceIdx = findContainer(String(active.id), prev.days)
      const targetIdx = findContainer(String(over.id), prev.days)
      if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return prev
      const next = applyDragResult(prev, String(active.id), String(over.id))
      planRef.current = next
      didCrossRef.current = true
      return next
    })
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    const didCross = didCrossRef.current
    didCrossRef.current = false

    if (!over || active.id === over.id) {
      if (didCross) scheduleRecalc(planRef.current)
      return
    }

    if (didCross) {
      scheduleRecalc(planRef.current)
    } else {
      const current = planRef.current
      const nextPlan = applyDragResult(current, String(active.id), String(over.id))
      scheduleRecalc(nextPlan !== current ? nextPlan : current)
    }
  }, [scheduleRecalc])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    didCrossRef.current = false
    const saved = savedPlanRef.current
    planRef.current = saved
    setPlan(saved)
  }, [])

  const handleTimeChange = useCallback(
    (dayIdx: number, placeId: string, field: 'startTime' | 'durationMin', value: string | number) => {
      const newDays = planRef.current.days.map((d, i) => {
        if (i !== dayIdx) return d
        return {
          ...d,
          places: d.places.map((p) =>
            p.id === placeId ? { ...p, [field]: value } : p
          ),
        }
      })
      scheduleRecalc({ ...planRef.current, days: newDays })
    },
    [scheduleRecalc]
  )

  const handleAddPlace = useCallback((place: Place) => {
    const newPlace: ScheduledPlace = {
      ...place,
      startTime: '09:00',
      durationMin: DWELL[place.type],
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }
    const targetDayIdx = findClosestDay(planRef.current.days, place)
    const newDays = planRef.current.days.map((d, i) =>
      i === targetDayIdx ? { ...d, places: [...d.places, newPlace] } : d
    )
    scheduleRecalc({ ...planRef.current, days: newDays })
  }, [scheduleRecalc])

  const handleAddPlaces = useCallback((places: Place[]) => {
    let next = planRef.current
    places.forEach((place) => {
      const newPlace: ScheduledPlace = {
        ...place,
        startTime: '09:00',
        durationMin: DWELL[place.type],
        travelMinToNext: null,
        aiDescription: null,
        outsideHours: false,
        lateExit: false,
        startLocked: false,
        durationLocked: false,
      }
      const targetDayIdx = findClosestDay(next.days, place)
      next = {
        ...next,
        days: next.days.map((d, i) =>
          i === targetDayIdx ? { ...d, places: [...d.places, newPlace] } : d
        ),
      }
    })
    scheduleRecalc(next)
  }, [scheduleRecalc])

  const handleAddRecommendation = useCallback((dayIdx: number, rec: DayRecommendation) => {
    const newPlace: ScheduledPlace = {
      id: crypto.randomUUID(),
      placeId: rec.placeId,
      name: rec.name,
      type: rec.type,
      lat: rec.lat,
      lng: rec.lng,
      address: rec.address,
      openingHours: rec.openingHours,
      rating: rec.rating,
      photoUrl: rec.photoUrl,
      description: rec.description,
      startTime: '09:00',
      durationMin: DWELL[rec.type],
      travelMinToNext: null,
      aiDescription: rec.reason,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }
    const newDays = planRef.current.days.map((d, i) =>
      i === dayIdx ? { ...d, places: [...d.places, newPlace] } : d
    )
    scheduleRecalc({ ...planRef.current, days: newDays })
    setRecsByDay((prev) => {
      if (!prev) return prev
      return prev.map((buckets, i) =>
        i === dayIdx
          ? {
              dessert: buckets.dessert.filter((r) => r.placeId !== rec.placeId),
              attraction: buckets.attraction.filter((r) => r.placeId !== rec.placeId),
              restaurant: buckets.restaurant.filter((r) => r.placeId !== rec.placeId),
            }
          : buckets
      )
    })
  }, [scheduleRecalc])

  const handleChangeStartDate = useCallback((iso: string) => {
    const recalced = recalcPlan({ ...planRef.current, startDate: iso })
    planRef.current = recalced
    setPlan(recalced)
  }, [])

  const handleChangeEndDate = useCallback((iso: string) => {
    const start = planRef.current.startDate
    const targetN = Math.max(1, daysBetween(start, iso < start ? start : iso))
    const M = planRef.current.days.length
    if (targetN > M) {
      const extra = Array.from({ length: targetN - M }, (_, k) => ({
        day: M + k + 1, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
      }))
      const newPlan = { ...planRef.current, days: [...planRef.current.days, ...extra] }
      planRef.current = newPlan
      setPlan(newPlan)
      setTargetDays(null)
    } else {
      // 縮短：不刪改，交由 §5（Task 5）的警告/解決；這裡只記錄目標 N
      setTargetDays(targetN)
    }
  }, [])

  const handleChangeDayWindow = useCallback((dayIdx: number, field: 'dayStart' | 'dayEnd', value: string) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      // dayEnd 不可早於 dayStart：若反向則夾到 dayStart
      const next = field === 'dayEnd' && value < d.dayStart ? d.dayStart : value
      return { ...d, [field]: next }
    })
    const recalced = recalcPlan({ ...planRef.current, days: newDays })
    planRef.current = recalced
    setPlan(recalced)
  }, [])

  const handleDeleteDay = useCallback((dayIdx: number) => {
    const next = renumberDays(planRef.current.days.filter((_, i) => i !== dayIdx))
    const recalced = recalcPlan({ ...planRef.current, days: next })
    planRef.current = recalced
    setPlan(recalced)
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
  }, [])

  const handleScatterDay = useCallback((dayIdx: number) => {
    const src = planRef.current.days[dayIdx]
    const kept = planRef.current.days.filter((_, i) => i !== dayIdx)
    let working = kept
    src.places.forEach((p) => {
      const target = findClosestDay(working, p)
      working = working.map((d, i) => i === target ? { ...d, places: [...d.places, { ...p, travelMinToNext: null }] } : d)
    })
    const next = renumberDays(working)
    const recalced = recalcPlan({ ...planRef.current, days: next })
    planRef.current = recalced
    setPlan(recalced)
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
  }, [])

  const N = targetDays ?? plan.days.length
  const overCount = Math.max(0, plan.days.length - N)

  const allPlaces = plan.days.flatMap((d) => d.places)
  const activePlace = activeId ? allPlaces.find(p => p.id === activeId) ?? null : null
  const activePlaceIndex = activeId ? allPlaces.findIndex(p => p.id === activeId) : -1

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <a href="/" className="text-blue-600 text-sm mb-6 inline-block">&#x2190; 重新規劃</a>
      <section className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">開始日期</span>
          <input type="date" data-testid="trip-start-date" value={plan.startDate}
            onChange={(e) => handleChangeStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">結束日期</span>
          <input type="date" data-testid="trip-end-date" min={plan.startDate}
            value={dayDate(plan.startDate, plan.days.length)}
            onChange={(e) => handleChangeEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <span className="text-sm text-gray-600 pb-1.5">共 {plan.days.length} 天</span>
      </section>
      {overCount > 0 && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-700">
          行程天數（{plan.days.length}）大於設定天數（{N}），請處理超出的天。
        </div>
      )}
      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">新增行程</h2>
        <CombinedInput onAdd={handleAddPlace} onAddPlaces={handleAddPlaces} />
      </section>
      <DndContext
        sensors={sensors}
        collisionDetection={multiContainerCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div>
          {plan.days.map((day, dayIdx) => (
            <SortableContext
              key={day.day}
              items={day.places.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <ItineraryDay
                day={day}
                dayIdx={dayIdx}
                mode={plan.transportMode}
                startDate={plan.startDate}
                isDragging={activeId !== null}
                onTimeChange={(placeId, field, value) =>
                  handleTimeChange(dayIdx, placeId, field, value)
                }
                onToggleStartLock={(placeId) => handleToggleStartLock(dayIdx, placeId)}
                onToggleDurationLock={(placeId) => handleToggleDurationLock(dayIdx, placeId)}
                onChangeType={(placeId, type) => handleChangeType(dayIdx, placeId, type)}
                onSetDayStartLock={(locked) => handleSetDayStartLock(dayIdx, locked)}
                onSetDayDurationLock={(locked) => handleSetDayDurationLock(dayIdx, locked)}
                onChangeWindow={(field, value) => handleChangeDayWindow(dayIdx, field, value)}
                isOverflow={dayIdx >= N}
                onScatter={() => handleScatterDay(dayIdx)}
                onDelete={() => handleDeleteDay(dayIdx)}
                draggable
                recommendations={recsByDay?.[dayIdx]}
                onAddRecommendation={(rec) => handleAddRecommendation(dayIdx, rec)}
              />
            </SortableContext>
          ))}
        </div>
        <DragOverlay>
          {activePlace ? (
            <div className="shadow-2xl rotate-1 opacity-95">
              <ItineraryCard
                place={activePlace}
                index={activePlaceIndex}
                dateIso={plan.startDate}
                draggable={false}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  )
}
