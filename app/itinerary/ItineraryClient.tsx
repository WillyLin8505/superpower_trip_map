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
import type { PlanResult, ScheduledPlace, Place } from '@/lib/types'
import { recalcPlan } from '@/lib/utils/clientScheduler'
import { ItineraryDay } from '@/components/ItineraryDay'
import { ItineraryCard } from '@/components/ItineraryCard'
import { RecommendPanel } from '@/components/RecommendPanel'
import { applyDragResult, findContainer } from '@/lib/utils/dragContainers'
import { findClosestDay } from '@/lib/utils/geo'
import { PlaceSearchBar } from '@/components/PlaceSearchBar'
import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'

// pointerWithin is essential for multi-container: it checks where the pointer
// physically is, not center-to-center distance (closestCenter favors the source container)
const multiContainerCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

interface Props {
  initial: PlanResult
}

export function ItineraryClient({ initial }: Props) {
  const [plan, setPlan] = useState<PlanResult>(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
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

  const handleToggleLock = useCallback((dayIdx: number, placeId: string) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        places: d.places.map((p) =>
          p.id === placeId ? { ...p, timeLocked: !p.timeLocked } : p
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
      durationMin: place.type === 'attraction' ? 90 : 60,
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      timeLocked: false,
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
        durationMin: place.type === 'attraction' ? 90 : 60,
        travelMinToNext: null,
        aiDescription: null,
        outsideHours: false,
        lateExit: false,
        timeLocked: false,
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

  const allPlaces = plan.days.flatMap((d) => d.places)
  const activePlace = activeId ? allPlaces.find(p => p.id === activeId) ?? null : null
  const activePlaceIndex = activeId ? allPlaces.findIndex(p => p.id === activeId) : -1

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <a href="/" className="text-blue-600 text-sm mb-6 inline-block">&#x2190; 重新規劃</a>
      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">新增行程</h2>
        <PlaceSearchBar onAdd={handleAddPlace} />
        <ItineraryPasteInput onPlacesFound={handleAddPlaces} />
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
                isDragging={activeId !== null}
                onTimeChange={(placeId, field, value) =>
                  handleTimeChange(dayIdx, placeId, field, value)
                }
                onToggleLock={(placeId) => handleToggleLock(dayIdx, placeId)}
                draggable
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
                draggable={false}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <RecommendPanel
        currentPlaces={allPlaces}
        onAddPlaces={(newPlaces) => {
          const lastDayIdx = planRef.current.days.length - 1
          const newDays = planRef.current.days.map((d, i) =>
            i === lastDayIdx
              ? { ...d, places: [...d.places, ...newPlaces] }
              : d
          )
          scheduleRecalc({ ...planRef.current, days: newDays })
        }}
      />
    </main>
  )
}
