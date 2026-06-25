'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import type { PlanResult, ScheduledPlace } from '@/lib/types'
import { ItineraryDay } from '@/components/ItineraryDay'
import { MapView } from '@/components/MapView'

// Temporary stub — replaced by Task 11
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function RecommendPanel(_props: { currentPlaces: ScheduledPlace[]; onAddPlaces: (p: ScheduledPlace[]) => void }) {
  return null
}

interface Props {
  initial: PlanResult
}

export function ItineraryClient({ initial }: Props) {
  const [plan, setPlan] = useState<PlanResult>(initial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sensors = useSensors(useSensor(PointerSensor))

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const scheduleRecalc = useCallback((nextPlan: PlanResult) => {
    setPlan(nextPlan)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // Recalculate startTimes for each day based on current order
      const recalced: PlanResult = {
        ...nextPlan,
        days: nextPlan.days.map((day) => {
          let cursor = 9 * 60
          const places: ScheduledPlace[] = day.places.map((p) => {
            const startTime = `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`
            cursor += p.durationMin + (p.travelMinToNext ?? 0)
            return { ...p, startTime }
          })
          return { ...day, places }
        }),
      }
      setPlan(recalced)
    }, 2000)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent, dayIdx: number) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const day = plan.days[dayIdx]
    const oldIdx = day.places.findIndex((p) => p.id === active.id)
    const newIdx = day.places.findIndex((p) => p.id === over.id)
    const newPlaces = arrayMove(day.places, oldIdx, newIdx)
    const newDays = plan.days.map((d, i) =>
      i === dayIdx ? { ...d, places: newPlaces } : d
    )
    scheduleRecalc({ ...plan, days: newDays })
  }, [plan, scheduleRecalc])

  const handleTimeChange = useCallback(
    (dayIdx: number, placeId: string, field: 'startTime' | 'durationMin', value: string | number) => {
      const newDays = plan.days.map((d, i) => {
        if (i !== dayIdx) return d
        return {
          ...d,
          places: d.places.map((p) =>
            p.id === placeId ? { ...p, [field]: value } : p
          ),
        }
      })
      scheduleRecalc({ ...plan, days: newDays })
    },
    [plan, scheduleRecalc]
  )

  const allPlaces = plan.days.flatMap((d) => d.places)

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <a href="/" className="text-blue-600 text-sm mb-6 inline-block">&#x2190; 重新規劃</a>
      <div className="flex gap-8">
        <div className="flex-1 min-w-0">
          {plan.days.map((day, dayIdx) => (
            <DndContext
              key={day.day}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(e, dayIdx)}
            >
              <SortableContext
                items={day.places.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <ItineraryDay
                  day={day}
                  onTimeChange={(placeId, field, value) =>
                    handleTimeChange(dayIdx, placeId, field, value)
                  }
                  draggable
                />
              </SortableContext>
            </DndContext>
          ))}
        </div>
        <div className="w-96 shrink-0 sticky top-4 h-[600px] rounded-xl overflow-hidden border border-gray-200">
          <MapView allPlaces={allPlaces} />
        </div>
      </div>
      <RecommendPanel
        currentPlaces={allPlaces}
        onAddPlaces={(newPlaces) => {
          // Append to last day for now; user can drag to preferred day
          const lastDayIdx = plan.days.length - 1
          const newDays = plan.days.map((d, i) =>
            i === lastDayIdx
              ? { ...d, places: [...d.places, ...newPlaces] }
              : d
          )
          scheduleRecalc({ ...plan, days: newDays })
        }}
      />
    </main>
  )
}
