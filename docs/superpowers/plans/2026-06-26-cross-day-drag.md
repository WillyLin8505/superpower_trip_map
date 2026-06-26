# Cross-Day Drag and Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to drag a place card from any day and drop it at a precise position in any other day.

**Architecture:** Extract drag logic into a pure `applyDragResult` function (testable without React), then wire up a single top-level `DndContext` in `ItineraryClient` with per-day `SortableContext` + `useDroppable`. The existing `ItineraryCard` `useSortable` setup is unchanged.

**Tech Stack:** `@dnd-kit/core` (DndContext, useDroppable), `@dnd-kit/sortable` (SortableContext), React state, TypeScript.

## Global Constraints

- No new npm dependencies — only packages already in `package.json`
- All tests in `__tests__/` must pass after each task
- Traditional Chinese UI copy unchanged
- `ItineraryCard.tsx` must not be modified
- `travelMinToNext` must be set to `null` for every place in both source and target day after any drag
- Droppable container IDs follow the pattern `"day-${dayIdx}"` exactly (zero-indexed)
- `ScheduledPlace`, `DayItinerary`, `PlanResult` types from `lib/types.ts` — do not modify types

---

### Task 1: Pure drag-logic utilities — `findContainer` and `applyDragResult`

**Files:**
- Create: `lib/utils/dragContainers.ts`
- Create: `__tests__/drag-containers.test.ts`

**Interfaces:**
- Consumes: `DayItinerary`, `PlanResult`, `ScheduledPlace` from `@/lib/types`
- Produces:
  - `findContainer(id: string, days: DayItinerary[]): number` — returns dayIdx, or `-1` if not found
  - `applyDragResult(plan: PlanResult, activeId: string, overId: string): PlanResult` — returns updated plan (same reference if nothing changed)

---

- [ ] **Step 1: Write the failing tests**

Create `__tests__/drag-containers.test.ts`:

```typescript
import type { DayItinerary, PlanResult, ScheduledPlace } from '@/lib/types'
import { findContainer, applyDragResult } from '@/lib/utils/dragContainers'

function makePlace(id: string): ScheduledPlace {
  return {
    id, placeId: id, name: id, type: 'attraction',
    lat: 25, lng: 121, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
  }
}

function makeDay(dayNum: number, placeIds: string[]): DayItinerary {
  return { day: dayNum, places: placeIds.map(makePlace), aiSummary: null }
}

const PLAN: PlanResult = {
  transportMode: 'driving',
  days: [
    makeDay(1, ['a', 'b', 'c']),
    makeDay(2, ['d', 'e']),
  ],
}

describe('findContainer', () => {
  test('finds day index by place id', () => {
    expect(findContainer('a', PLAN.days)).toBe(0)
    expect(findContainer('d', PLAN.days)).toBe(1)
  })

  test('finds day index by day- prefix', () => {
    expect(findContainer('day-0', PLAN.days)).toBe(0)
    expect(findContainer('day-1', PLAN.days)).toBe(1)
  })

  test('returns -1 for unknown id', () => {
    expect(findContainer('unknown', PLAN.days)).toBe(-1)
  })
})

describe('applyDragResult', () => {
  test('same-day reorder: moves b before a', () => {
    const result = applyDragResult(PLAN, 'b', 'a')
    expect(result.days[0].places.map((p) => p.id)).toEqual(['b', 'a', 'c'])
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'e'])
  })

  test('same-day reorder: clears travelMinToNext', () => {
    const planWithTravel: PlanResult = {
      ...PLAN,
      days: [
        {
          ...PLAN.days[0],
          places: PLAN.days[0].places.map((p) => ({ ...p, travelMinToNext: 10 })),
        },
        PLAN.days[1],
      ],
    }
    const result = applyDragResult(planWithTravel, 'b', 'a')
    result.days[0].places.forEach((p) => expect(p.travelMinToNext).toBeNull())
  })

  test('cross-day move: inserts at target card position', () => {
    // drag 'a' from day 0, drop on 'e' in day 1 → inserts before 'e'
    const result = applyDragResult(PLAN, 'a', 'e')
    expect(result.days[0].places.map((p) => p.id)).toEqual(['b', 'c'])
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'a', 'e'])
  })

  test('cross-day move: appends when dropped on day container', () => {
    const result = applyDragResult(PLAN, 'a', 'day-1')
    expect(result.days[0].places.map((p) => p.id)).toEqual(['b', 'c'])
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'e', 'a'])
  })

  test('cross-day move: clears travelMinToNext in both days', () => {
    const planWithTravel: PlanResult = {
      ...PLAN,
      days: PLAN.days.map((day) => ({
        ...day,
        places: day.places.map((p) => ({ ...p, travelMinToNext: 10 })),
      })),
    }
    const result = applyDragResult(planWithTravel, 'a', 'day-1')
    result.days[0].places.forEach((p) => expect(p.travelMinToNext).toBeNull())
    result.days[1].places.forEach((p) => expect(p.travelMinToNext).toBeNull())
  })

  test('returns same plan reference when source not found', () => {
    const result = applyDragResult(PLAN, 'unknown', 'b')
    expect(result).toBe(PLAN)
  })

  test('source day is empty after moving its last place', () => {
    const singlePlacePlan: PlanResult = {
      ...PLAN,
      days: [makeDay(1, ['only']), makeDay(2, ['d', 'e'])],
    }
    const result = applyDragResult(singlePlacePlan, 'only', 'day-1')
    expect(result.days[0].places).toHaveLength(0)
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'e', 'only'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/drag-containers.test.ts --no-coverage
```

Expected: all 9 tests FAIL with "Cannot find module '@/lib/utils/dragContainers'"

- [ ] **Step 3: Create `lib/utils/dragContainers.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/drag-containers.test.ts --no-coverage
```

Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/dragContainers.ts __tests__/drag-containers.test.ts
git commit -m "feat: add findContainer and applyDragResult drag utilities"
```

---

### Task 2: Wire up single DndContext + useDroppable per day

**Files:**
- Modify: `components/ItineraryDay.tsx`
- Modify: `app/itinerary/ItineraryClient.tsx`
- Modify: `__tests__/itinerary-day-embed.test.tsx` (add mock for useDroppable)
- Test: `__tests__/drag-containers.test.ts` (already passing — must stay passing)

**Interfaces:**
- Consumes: `findContainer`, `applyDragResult` from `@/lib/utils/dragContainers` (Task 1)
- Produces: updated `ItineraryDay` component with new required prop `dayIdx: number`

---

- [ ] **Step 1: Update `__tests__/itinerary-day-embed.test.tsx` to mock `useDroppable`**

`ItineraryDay` will now call `useDroppable` which requires `DndContext`. Add a mock at the top of the test file so it keeps working in isolation. Also add `dayIdx={0}` to each render call.

Replace the entire file with:

```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: jest.fn(), isOver: false }),
}))
jest.mock('@/components/ItineraryCard', () => ({
  ItineraryCard: ({ place }: { place: ScheduledPlace }) => <div>{place.name}</div>,
}))
jest.mock('@/lib/utils/mapUrl', () => ({
  buildDayEmbedUrl: jest.fn((places: ScheduledPlace[]) =>
    places.length >= 2 ? 'https://maps.google.com/embed/test' : ''
  ),
}))

import { ItineraryDay } from '@/components/ItineraryDay'

function makePlace(name: string): ScheduledPlace {
  return {
    id: name, placeId: name, name, type: 'attraction',
    lat: 25, lng: 121, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
  }
}

const DAY_TWO_PLACES: DayItinerary = {
  day: 1,
  places: [makePlace('景點A'), makePlace('景點B')],
  aiSummary: null,
}

test('renders iframe with embed URL when 2+ places', () => {
  render(<ItineraryDay day={DAY_TWO_PLACES} dayIdx={0} mode="driving" />)
  const iframe = screen.getByTitle('第 1 天路線地圖')
  expect(iframe).toBeInTheDocument()
  expect(iframe).toHaveAttribute('src', 'https://maps.google.com/embed/test')
})

test('does not render iframe when only 1 place', () => {
  const onePlace = { ...DAY_TWO_PLACES, places: [makePlace('景點A')] }
  render(<ItineraryDay day={onePlace} dayIdx={0} mode="driving" />)
  expect(screen.queryByTitle('第 1 天路線地圖')).toBeNull()
})

test('passes mode to buildDayEmbedUrl', () => {
  const { buildDayEmbedUrl } = require('@/lib/utils/mapUrl')
  render(<ItineraryDay day={DAY_TWO_PLACES} dayIdx={0} mode="transit" />)
  expect(buildDayEmbedUrl).toHaveBeenCalledWith(DAY_TWO_PLACES.places, 'transit')
})
```

- [ ] **Step 2: Update `components/ItineraryDay.tsx`**

Replace the entire file with:

```tsx
'use client'
import { useDroppable } from '@dnd-kit/core'
import { ItineraryCard } from './ItineraryCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import type { DayItinerary, TransportMode } from '@/lib/types'

interface Props {
  day: DayItinerary
  dayIdx: number
  mode: TransportMode
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryDay({ day, dayIdx, mode, draggable, onTimeChange }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)
  const { setNodeRef } = useDroppable({ id: `day-${dayIdx}` })

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="flex gap-6 items-start">
        <div ref={setNodeRef} className="flex-1 space-y-3">
          {day.places.map((place, i) => (
            <ItineraryCard
              key={place.id}
              place={place}
              index={i}
              draggable={draggable}
              onTimeChange={onTimeChange}
            />
          ))}
        </div>
        {embedUrl && (
          <div className="w-96 shrink-0 sticky top-4 rounded-xl overflow-hidden border border-gray-200">
            <iframe
              src={embedUrl}
              width="100%"
              height="500"
              style={{ border: 0 }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              title={`第 ${day.day} 天路線地圖`}
            />
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Run embed tests to confirm they pass with new prop**

```bash
npx jest __tests__/itinerary-day-embed.test.tsx --no-coverage
```

Expected: 3 tests PASS.

- [ ] **Step 4: Update `app/itinerary/ItineraryClient.tsx`**

Replace the entire file with:

```tsx
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
} from '@dnd-kit/sortable'
import type { PlanResult, ScheduledPlace } from '@/lib/types'
import { ItineraryDay } from '@/components/ItineraryDay'
import { RecommendPanel } from '@/components/RecommendPanel'
import { applyDragResult } from '@/lib/utils/dragContainers'

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

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const nextPlan = applyDragResult(plan, String(active.id), String(over.id))
    if (nextPlan !== plan) scheduleRecalc(nextPlan)
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
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
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
                onTimeChange={(placeId, field, value) =>
                  handleTimeChange(dayIdx, placeId, field, value)
                }
                draggable
              />
            </SortableContext>
          ))}
        </div>
      </DndContext>
      <RecommendPanel
        currentPlaces={allPlaces}
        onAddPlaces={(newPlaces) => {
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
```

- [ ] **Step 5: Run the full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -8
```

Expected:
```
Test Suites: 15 passed, 15 total
Tests:       60 passed, 60 total
```

(14 existing suites + 1 new `drag-containers` suite; 51 existing tests + 9 new tests = 60)

- [ ] **Step 6: Commit**

```bash
git add components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx __tests__/itinerary-day-embed.test.tsx
git commit -m "feat: enable cross-day drag and drop with single DndContext"
```
