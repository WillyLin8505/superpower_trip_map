# Time Picker, Lock Scheduler & Itinerary Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the time input with a 24h scroll-wheel picker, change all time displays to "HH:MM → HH:MM", upgrade the scheduler to backwards-fill before locked cards, and add a Google Places search box + AI paste field to the itinerary page.

**Architecture:** Six sequential tasks: shared time utilities → geo utility → pure client scheduler → scroll-wheel picker → card display update → itinerary page inputs. Each task produces a tested, committable deliverable. The scheduler is extracted to `lib/utils/clientScheduler.ts` (pure function, no React) so it can be unit-tested without mounting components.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, `@dnd-kit`, React hooks, no new npm packages.

## Global Constraints

- TypeScript strict — no `any`
- No new npm dependencies
- Traditional Chinese (繁體中文) UI copy throughout
- 24-hour time format everywhere — no AM/PM
- Scroll-wheel picker uses 5-minute steps for minutes (00, 05, 10 … 55)
- All existing 84 tests must continue to pass; new tests required for new logic
- `ScheduledPlace` type shape is unchanged
- `/** @jest-environment jsdom */` must be the first line of every `.test.tsx` file

---

### Task 1: Shared Time Utilities (`lib/utils/time.ts`)

**Files:**
- Create: `lib/utils/time.ts`
- Create: `__tests__/time-utils.test.ts`

**Interfaces:**
- Produces:
  - `addMinutes(startTime: string, minutes: number): string` — returns `"HH:MM"` for startTime + minutes, clamped to 00:00 minimum, wraps at 23:59
  - `minsToTime(mins: number): string` — converts minutes-since-midnight to `"HH:MM"`, clamped to 00:00 minimum

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/time-utils.test.ts
import { addMinutes, minsToTime } from '@/lib/utils/time'

test('minsToTime converts 540 to 09:00', () => {
  expect(minsToTime(540)).toBe('09:00')
})

test('minsToTime converts 0 to 00:00', () => {
  expect(minsToTime(0)).toBe('00:00')
})

test('minsToTime clamps negative to 00:00', () => {
  expect(minsToTime(-30)).toBe('00:00')
})

test('minsToTime converts 1439 to 23:59', () => {
  expect(minsToTime(1439)).toBe('23:59')
})

test('addMinutes adds 90 minutes to 09:00 giving 10:30', () => {
  expect(addMinutes('09:00', 90)).toBe('10:30')
})

test('addMinutes wraps past midnight', () => {
  expect(addMinutes('23:00', 90)).toBe('00:30')
})

test('addMinutes with 0 minutes returns same time', () => {
  expect(addMinutes('14:30', 0)).toBe('14:30')
})
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd /mnt/d/vibe_coding_project/food_map/superpowers_food_map
npx jest __tests__/time-utils.test.ts --no-coverage
```
Expected: FAIL — "Cannot find module '@/lib/utils/time'"

- [ ] **Step 3: Implement**

```typescript
// lib/utils/time.ts
export function minsToTime(mins: number): string {
  const clamped = Math.max(0, mins)
  return `${String(Math.floor(clamped / 60) % 24).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

export function addMinutes(startTime: string, minutes: number): string {
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + minutes
  const clamped = ((total % 1440) + 1440) % 1440  // wrap 0–1439
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
npx jest __tests__/time-utils.test.ts --no-coverage
```
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/utils/time.ts __tests__/time-utils.test.ts
git commit -m "feat: add addMinutes and minsToTime shared time utilities"
```

---

### Task 2: Geographic Closest-Day Utility (`lib/utils/geo.ts`)

**Files:**
- Create: `lib/utils/geo.ts`
- Create: `__tests__/find-closest-day.test.ts`

**Interfaces:**
- Consumes: `haversineSeconds` from `@/lib/haversine` (signature: `(a: {lat:number;lng:number}, b: {lat:number;lng:number}) => number`)
- Consumes: `DayItinerary` from `@/lib/types`
- Produces: `findClosestDay(days: DayItinerary[], place: { lat: number; lng: number }): number`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/find-closest-day.test.ts
import { findClosestDay } from '@/lib/utils/geo'
import type { DayItinerary } from '@/lib/types'

function makeDay(places: { lat: number; lng: number }[]): DayItinerary {
  return {
    day: 1,
    aiSummary: null,
    places: places.map((p, i) => ({
      id: `id-${i}`,
      placeId: `pid-${i}`,
      name: 'place',
      type: 'attraction' as const,
      lat: p.lat,
      lng: p.lng,
      address: '',
      openingHours: null,
      rating: null,
      photoUrl: null,
      description: null,
      startTime: '09:00',
      durationMin: 90,
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      timeLocked: false,
    })),
  }
}

test('returns 0 when only one day', () => {
  const days = [makeDay([{ lat: 25.0, lng: 121.5 }])]
  expect(findClosestDay(days, { lat: 25.1, lng: 121.6 })).toBe(0)
})

test('returns index of closer centroid', () => {
  const day0 = makeDay([{ lat: 25.0, lng: 121.5 }])   // near Taipei
  const day1 = makeDay([{ lat: 22.6, lng: 120.3 }])   // near Kaohsiung
  const newPlace = { lat: 25.05, lng: 121.55 }         // near Taipei
  expect(findClosestDay([day0, day1], newPlace)).toBe(0)
})

test('skips empty days (treats them as infinitely far)', () => {
  const emptyDay = makeDay([])
  const populatedDay = makeDay([{ lat: 25.0, lng: 121.5 }])
  const newPlace = { lat: 25.0, lng: 121.5 }
  expect(findClosestDay([emptyDay, populatedDay], newPlace)).toBe(1)
})

test('uses centroid of multiple places per day', () => {
  // Day 0 centroid = (25.0, 121.5)
  const day0 = makeDay([{ lat: 24.9, lng: 121.4 }, { lat: 25.1, lng: 121.6 }])
  // Day 1 centroid = (22.6, 120.3)
  const day1 = makeDay([{ lat: 22.6, lng: 120.3 }])
  expect(findClosestDay([day0, day1], { lat: 25.0, lng: 121.5 })).toBe(0)
})
```

- [ ] **Step 2: Run to verify FAIL**

```bash
npx jest __tests__/find-closest-day.test.ts --no-coverage
```
Expected: FAIL — "Cannot find module '@/lib/utils/geo'"

- [ ] **Step 3: Implement**

```typescript
// lib/utils/geo.ts
import { haversineSeconds } from '@/lib/haversine'
import type { DayItinerary } from '@/lib/types'

export function findClosestDay(
  days: DayItinerary[],
  place: { lat: number; lng: number }
): number {
  if (days.length === 1) return 0
  const distances = days.map((day) => {
    if (day.places.length === 0) return Infinity
    const centroidLat = day.places.reduce((s, p) => s + p.lat, 0) / day.places.length
    const centroidLng = day.places.reduce((s, p) => s + p.lng, 0) / day.places.length
    return haversineSeconds({ lat: centroidLat, lng: centroidLng }, place)
  })
  return distances.indexOf(Math.min(...distances))
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
npx jest __tests__/find-closest-day.test.ts --no-coverage
```
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/utils/geo.ts __tests__/find-closest-day.test.ts
git commit -m "feat: add findClosestDay utility for geographic day assignment"
```

---

### Task 3: Client Scheduler with Backwards-Fill (`lib/utils/clientScheduler.ts`)

**Files:**
- Create: `lib/utils/clientScheduler.ts`
- Create: `__tests__/client-scheduler.test.ts`
- Modify: `app/itinerary/ItineraryClient.tsx` — replace inline `scheduleRecalc` logic with import

**Interfaces:**
- Consumes: `minsToTime` from `@/lib/utils/time`; `checkLateExit`, `checkOutsideHours` from `@/lib/utils/hours`; `PlanResult`, `ScheduledPlace`, `DayItinerary` from `@/lib/types`
- Produces: `recalcPlan(plan: PlanResult): PlanResult`

**Algorithm:**

```
For each day:
  1. Find indices of all timeLocked places.
  2. If none → scheduleForward(all places, DAY_START=540).
  3. Otherwise split places into segments:
     - leading: places before first lock
     - between[k]: places between lock[k] and lock[k+1]
     - trailing: places after last lock
  4. Leading segment → scheduleBackwards(segment, firstLock.startMin)
     where firstLock.startMin = parsed from firstLock.startTime
  5. Each locked place → keep startTime + durationMin, recompute outsideHours + lateExit
  6. Between[k] → scheduleForward(segment, lock[k].startMin + lock[k].durationMin + (lock[k].travelMinToNext ?? 0))
  7. Trailing → scheduleForward(segment, lastLock.startMin + lastLock.durationMin + (lastLock.travelMinToNext ?? 0))
```

**Backwards-fill formula (for each card working in reverse):**
```
startMin = cursor - p.durationMin - (p.travelMinToNext ?? 0)
cursor = startMin
```
Where `cursor` starts at `firstLock.startMin` and decreases through the leading segment.

This matches the forward formula: `cursor_after_A = A.startMin + A.durationMin + A.travelMinToNext` → inverted: `A.startMin = cursor_after_A - A.durationMin - A.travelMinToNext`.

If any computed `startMin < DAY_START` in `scheduleBackwards`, mark that card `outsideHours: true` (orange border warning — "早於開始時間").

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/client-scheduler.test.ts
import { recalcPlan } from '@/lib/utils/clientScheduler'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

function makePlace(overrides: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: Math.random().toString(),
    placeId: 'pid',
    name: 'place',
    type: 'attraction',
    lat: 25.0,
    lng: 121.5,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
    startTime: '09:00',
    durationMin: 60,
    travelMinToNext: 0,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    timeLocked: false,
    ...overrides,
  }
}

function makePlan(places: ScheduledPlace[]): PlanResult {
  return { days: [{ day: 1, places, aiSummary: null }], transportMode: 'driving' }
}

// --- No locked cards: simple forward fill ---
test('no locked cards: first place starts at 09:00', () => {
  const p1 = makePlace({ durationMin: 90, travelMinToNext: 30 })
  const p2 = makePlace({ durationMin: 60, travelMinToNext: 0 })
  const result = recalcPlan(makePlan([p1, p2]))
  expect(result.days[0].places[0].startTime).toBe('09:00')
  expect(result.days[0].places[1].startTime).toBe('10:30') // 09:00 + 90 + 30 = 10:30
})

// --- Leading segment backwards fill ---
test('one unlocked before locked: unlocked ends exactly at locked start', () => {
  // lock at 11:00, unlocked durationMin=60, travelMinToNext=30
  // expected: unlocked starts at 11:00 - 60 - 30 = 09:30
  const unlocked = makePlace({ durationMin: 60, travelMinToNext: 30 })
  const locked = makePlace({ startTime: '11:00', durationMin: 90, travelMinToNext: 0, timeLocked: true })
  const result = recalcPlan(makePlan([unlocked, locked]))
  expect(result.days[0].places[0].startTime).toBe('09:30')
  expect(result.days[0].places[1].startTime).toBe('11:00') // lock unchanged
})

// --- Trailing segment forward fill ---
test('unlocked after locked: starts at lock end', () => {
  // lock at 10:00, durationMin=60, travelMinToNext=30 → next starts at 11:30
  const locked = makePlace({ startTime: '10:00', durationMin: 60, travelMinToNext: 30, timeLocked: true })
  const after = makePlace({ durationMin: 90, travelMinToNext: 0 })
  const result = recalcPlan(makePlan([locked, after]))
  expect(result.days[0].places[0].startTime).toBe('10:00') // lock unchanged
  expect(result.days[0].places[1].startTime).toBe('11:30') // 10:00 + 60 + 30
})

// --- Lock in middle ---
test('unlocked before and after locked', () => {
  const before = makePlace({ durationMin: 60, travelMinToNext: 30 })
  const locked = makePlace({ startTime: '11:00', durationMin: 90, travelMinToNext: 30, timeLocked: true })
  const after = makePlace({ durationMin: 60, travelMinToNext: 0 })
  const result = recalcPlan(makePlan([before, locked, after]))
  // before: starts at 11:00 - 60 - 30 = 09:30
  expect(result.days[0].places[0].startTime).toBe('09:30')
  // lock unchanged
  expect(result.days[0].places[1].startTime).toBe('11:00')
  // after: 11:00 + 90 + 30 = 13:00
  expect(result.days[0].places[2].startTime).toBe('13:00')
})

// --- outsideHours when before DAY_START ---
test('outsideHours true when backwards fill goes before 09:00', () => {
  // lock at 09:30, unlocked durationMin=90 travelMinToNext=0
  // backwards: startMin = 9*60+30 - 90 - 0 = 480 = 08:00 < DAY_START
  const unlocked = makePlace({ durationMin: 90, travelMinToNext: 0 })
  const locked = makePlace({ startTime: '09:30', durationMin: 60, travelMinToNext: 0, timeLocked: true })
  const result = recalcPlan(makePlan([unlocked, locked]))
  expect(result.days[0].places[0].outsideHours).toBe(true)
  expect(result.days[0].places[0].startTime).toBe('08:00')
})

// --- lock's own outsideHours/lateExit recomputed ---
test('locked place outsideHours recomputed', () => {
  // lock has null openingHours → checkOutsideHours returns false
  const locked = makePlace({ startTime: '10:00', durationMin: 60, timeLocked: true, openingHours: null, outsideHours: true })
  const result = recalcPlan(makePlan([locked]))
  expect(result.days[0].places[0].outsideHours).toBe(false)
})

// --- multiple days processed independently ---
test('multiple days each recalculated independently', () => {
  const plan: PlanResult = {
    transportMode: 'driving',
    days: [
      { day: 1, places: [makePlace({ durationMin: 60, travelMinToNext: 0 })], aiSummary: null },
      { day: 2, places: [makePlace({ durationMin: 90, travelMinToNext: 0 })], aiSummary: null },
    ],
  }
  const result = recalcPlan(plan)
  expect(result.days[0].places[0].startTime).toBe('09:00')
  expect(result.days[1].places[0].startTime).toBe('09:00')
})
```

- [ ] **Step 2: Run to verify FAIL**

```bash
npx jest __tests__/client-scheduler.test.ts --no-coverage
```
Expected: FAIL — "Cannot find module '@/lib/utils/clientScheduler'"

- [ ] **Step 3: Implement `lib/utils/clientScheduler.ts`**

```typescript
// lib/utils/clientScheduler.ts
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'
import { checkLateExit, checkOutsideHours } from '@/lib/utils/hours'
import { minsToTime } from '@/lib/utils/time'

const DAY_START = 9 * 60

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

function applyWarnings(p: ScheduledPlace, startTime: string, startMin: number): ScheduledPlace {
  return {
    ...p,
    startTime,
    outsideHours: startMin < DAY_START || checkOutsideHours(startTime, p.openingHours),
    lateExit: checkLateExit(startTime, p.durationMin, p.openingHours),
  }
}

function scheduleForward(places: ScheduledPlace[], startMin: number): ScheduledPlace[] {
  let cursor = startMin
  return places.map((p) => {
    const startTime = minsToTime(cursor)
    const result = applyWarnings(p, startTime, cursor)
    cursor += p.durationMin + (p.travelMinToNext ?? 0)
    return result
  })
}

function scheduleBackwards(places: ScheduledPlace[], nextStartMin: number): ScheduledPlace[] {
  // nextStartMin = start time of the thing that comes after this segment (e.g. a locked place's startMin)
  // For each card in reverse: startMin = cursor - durationMin - travelMinToNext; cursor = startMin
  let cursor = nextStartMin
  return [...places].reverse().map((p) => {
    const startMin = cursor - p.durationMin - (p.travelMinToNext ?? 0)
    const startTime = minsToTime(Math.max(0, startMin))
    cursor = startMin
    return applyWarnings(p, startTime, startMin)
  }).reverse()
}

function recalcDay(day: DayItinerary): DayItinerary {
  const places = day.places
  const lockIndices = places.reduce<number[]>((acc, p, i) => (p.timeLocked ? [...acc, i] : acc), [])

  if (lockIndices.length === 0) {
    return { ...day, places: scheduleForward(places, DAY_START) }
  }

  const result: ScheduledPlace[] = [...places]

  // Leading segment: backwards from first lock's startTime
  const firstLockIdx = lockIndices[0]
  if (firstLockIdx > 0) {
    const leading = places.slice(0, firstLockIdx)
    const scheduled = scheduleBackwards(leading, toMin(places[firstLockIdx].startTime))
    scheduled.forEach((p, i) => { result[i] = p })
  }

  // Locked places: keep startTime + durationMin, recompute warnings
  lockIndices.forEach((idx) => {
    const p = places[idx]
    const startTime = p.startTime
    result[idx] = {
      ...p,
      outsideHours: checkOutsideHours(startTime, p.openingHours),
      lateExit: checkLateExit(startTime, p.durationMin, p.openingHours),
    }
  })

  // Segments after each lock (between locks and trailing): forward from lock's end
  lockIndices.forEach((lockIdx, k) => {
    const nextLockIdx = lockIndices[k + 1] ?? places.length
    const segment = places.slice(lockIdx + 1, nextLockIdx)
    if (segment.length === 0) return
    const lock = places[lockIdx]
    const lockEndMin = toMin(lock.startTime) + lock.durationMin + (lock.travelMinToNext ?? 0)
    const scheduled = scheduleForward(segment, lockEndMin)
    scheduled.forEach((p, i) => { result[lockIdx + 1 + i] = p })
  })

  return { ...day, places: result }
}

export function recalcPlan(plan: PlanResult): PlanResult {
  return { ...plan, days: plan.days.map(recalcDay) }
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
npx jest __tests__/client-scheduler.test.ts --no-coverage
```
Expected: 7 tests PASS

- [ ] **Step 5: Update `ItineraryClient.tsx` to use `recalcPlan`**

In `app/itinerary/ItineraryClient.tsx`, replace the inline debounce body. Add import at top:

```typescript
import { recalcPlan } from '@/lib/utils/clientScheduler'
```

Replace the debounce body inside `scheduleRecalc` (the `setTimeout` callback — lines starting with `const recalced: PlanResult = {` through the inner `setPlan(recalced)`):

```typescript
debounceRef.current = setTimeout(() => {
  const recalced = recalcPlan(planRef.current)
  planRef.current = recalced
  setPlan(recalced)
}, 2000)
```

Remove the now-unused imports `checkLateExit` and `checkOutsideHours` from `ItineraryClient.tsx` (they are now used only inside `clientScheduler.ts`).

- [ ] **Step 6: Run full suite to verify no regressions**

```bash
npx jest --no-coverage
```
Expected: 91 tests PASS (84 existing + 7 new)

- [ ] **Step 7: Commit**

```bash
git add lib/utils/clientScheduler.ts __tests__/client-scheduler.test.ts app/itinerary/ItineraryClient.tsx
git commit -m "feat: extract recalcPlan with backwards-fill scheduler for locked cards"
```

---

### Task 4: 24h Scroll-Wheel Time Picker (`components/TimeScrollPicker.tsx`)

**Files:**
- Create: `components/TimeScrollPicker.tsx`
- Create: `__tests__/time-scroll-picker.test.tsx`

**Interfaces:**
- Produces:
```typescript
interface Props {
  value: string            // "HH:MM" 24h
  onChange: (v: string) => void
}
export function TimeScrollPicker({ value, onChange }: Props): JSX.Element
```

**UI spec:**
- Trigger: `<button>` showing the current `value` (e.g. `"09:30"`), styled like `text-blue-600 underline underline-offset-2 text-sm`
- On click: toggle an inline picker panel open/closed
- Picker: two `<ul>` columns — hours (strings `'00'–'23'`) and minutes (`'00','05','10',…,'55'`)
- Each column is `overflow-y-auto h-40` (5 visible rows at `h-8` each)
- Each `<li>`: `h-8 flex items-center justify-center text-sm cursor-pointer select-none` — clicking immediately updates state and calls `onChange`
- Selected item: `font-semibold text-blue-700 bg-blue-50 rounded`
- On mount / when picker opens: `scrollIntoView({ block: 'center' })` on selected `<li>` refs
- Close on outside click: `mousedown` event listener on `document` (use `useEffect` + `useRef` on the container div)

- [ ] **Step 1: Write failing tests**

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeScrollPicker } from '@/components/TimeScrollPicker'

test('displays the current value as trigger text', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  expect(screen.getByRole('button', { name: '09:30' })).toBeInTheDocument()
})

test('picker panel is hidden initially', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  expect(screen.queryByText('08')).toBeNull()  // hour 08 only visible when open
})

test('clicking trigger opens the picker', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  expect(screen.getByText('08')).toBeInTheDocument()
})

test('clicking an hour calls onChange with new HH:MM', () => {
  const onChange = jest.fn()
  render(<TimeScrollPicker value="09:30" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  // Click hour "14"
  fireEvent.click(screen.getByText('14'))
  expect(onChange).toHaveBeenCalledWith('14:30')
})

test('clicking a minute calls onChange with new HH:MM', () => {
  const onChange = jest.fn()
  render(<TimeScrollPicker value="09:30" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  // Click minute "45"
  fireEvent.click(screen.getByText('45'))
  expect(onChange).toHaveBeenCalledWith('09:45')
})

test('hours list contains 00 through 23', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  expect(screen.getByText('00')).toBeInTheDocument()
  expect(screen.getByText('23')).toBeInTheDocument()
})

test('minutes list contains 00, 05, 10 … 55', () => {
  render(<TimeScrollPicker value="09:00" onChange={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '09:00' }))
  expect(screen.getByText('55')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify FAIL**

```bash
npx jest __tests__/time-scroll-picker.test.tsx --no-coverage
```
Expected: FAIL — "Cannot find module '@/components/TimeScrollPicker'"

- [ ] **Step 3: Implement `components/TimeScrollPicker.tsx`**

```tsx
'use client'
import { useState, useEffect, useRef } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

interface Props {
  value: string
  onChange: (v: string) => void
}

export function TimeScrollPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [h, setH] = useState(value.split(':')[0])
  const [m, setM] = useState(value.split(':')[1])
  const containerRef = useRef<HTMLDivElement>(null)
  const selHourRef = useRef<HTMLLIElement>(null)
  const selMinRef = useRef<HTMLLIElement>(null)

  // Sync internal state when value prop changes externally
  useEffect(() => {
    setH(value.split(':')[0])
    setM(value.split(':')[1])
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Scroll selected items into view when picker opens
  useEffect(() => {
    if (!open) return
    selHourRef.current?.scrollIntoView({ block: 'center' })
    selMinRef.current?.scrollIntoView({ block: 'center' })
  }, [open])

  const selectHour = (newH: string) => {
    setH(newH)
    onChange(`${newH}:${m}`)
  }

  const selectMin = (newM: string) => {
    setM(newM)
    onChange(`${h}:${newM}`)
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-blue-600 underline underline-offset-2"
      >
        {h}:{m}
      </button>
      {open && (
        <div className="absolute z-50 top-7 left-0 bg-white border border-gray-200 rounded-lg shadow-lg flex gap-0 overflow-hidden">
          <ul className="overflow-y-auto h-40 w-12 scroll-smooth">
            {HOURS.map((hr) => (
              <li
                key={hr}
                ref={hr === h ? selHourRef : undefined}
                onClick={() => selectHour(hr)}
                className={`h-8 flex items-center justify-center text-sm cursor-pointer select-none ${
                  hr === h ? 'font-semibold text-blue-700 bg-blue-50 rounded' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {hr}
              </li>
            ))}
          </ul>
          <div className="w-px bg-gray-100" />
          <ul className="overflow-y-auto h-40 w-12 scroll-smooth">
            {MINUTES.map((mn) => (
              <li
                key={mn}
                ref={mn === m ? selMinRef : undefined}
                onClick={() => selectMin(mn)}
                className={`h-8 flex items-center justify-center text-sm cursor-pointer select-none ${
                  mn === m ? 'font-semibold text-blue-700 bg-blue-50 rounded' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {mn}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
npx jest __tests__/time-scroll-picker.test.tsx --no-coverage
```
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add components/TimeScrollPicker.tsx __tests__/time-scroll-picker.test.tsx
git commit -m "feat: add 24h scroll-wheel TimeScrollPicker component"
```

---

### Task 5: ItineraryCard Time Display + Delete TimeEditor

**Files:**
- Modify: `components/ItineraryCard.tsx`
- Delete: `components/TimeEditor.tsx`
- Modify: `__tests__/itinerary-card-info.test.tsx`

**What changes:**
- Import `TimeScrollPicker` instead of `TimeEditor`
- Import `addMinutes` from `@/lib/utils/time`
- Replace the three time display branches with start→end format
- Delete `components/TimeEditor.tsx`
- Update existing tests that expected "停留 N 分鐘" → now expect "HH:MM → HH:MM"

**New time display block (replaces the existing `<div className="flex gap-4 mt-1 flex-wrap">` contents):**

```tsx
<div className="flex items-center gap-1 mt-1 flex-wrap">
  {place.timeLocked ? (
    <p className="text-sm text-gray-500">
      {place.startTime} → {addMinutes(place.startTime, place.durationMin)}
    </p>
  ) : onTimeChange ? (
    <>
      <TimeScrollPicker
        value={place.startTime}
        onChange={(v) => onTimeChange(place.id, 'startTime', v)}
      />
      <span className="text-gray-400 text-sm">→</span>
      <TimeScrollPicker
        value={addMinutes(place.startTime, place.durationMin)}
        onChange={(v) => {
          const [eh, em] = v.split(':').map(Number)
          const [sh, sm] = place.startTime.split(':').map(Number)
          const dur = eh * 60 + em - (sh * 60 + sm)
          if (dur > 0) onTimeChange(place.id, 'durationMin', dur)
        }}
      />
    </>
  ) : (
    <p className="text-sm text-gray-500">
      {place.startTime} → {addMinutes(place.startTime, place.durationMin)}
    </p>
  )}
</div>
```

**Updated imports at top of `components/ItineraryCard.tsx`:**
```tsx
'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeScrollPicker } from './TimeScrollPicker'
import { getTodayHours } from '@/lib/utils/hours'
import { addMinutes } from '@/lib/utils/time'
import type { PlaceType, ScheduledPlace } from '@/lib/types'
```

- [ ] **Step 1: Update `__tests__/itinerary-card-info.test.tsx`**

Add a jest mock for `TimeScrollPicker` **after** the existing mocks and **before** the `import { ItineraryCard }` line:

```typescript
jest.mock('@/components/TimeScrollPicker', () => ({
  TimeScrollPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange(value)}>{value}</button>
  ),
}))
```

Find and replace the test `'hides TimeEditors and shows static time text when timeLocked'` with:

```typescript
test('hides TimeScrollPickers and shows static start→end when timeLocked', () => {
  render(
    <ItineraryCard
      place={{ ...BASE_PLACE, timeLocked: true }}
      index={0}
      onTimeChange={jest.fn()}
      onToggleLock={jest.fn()}
    />
  )
  // Static text: 09:00 → 10:30 (09:00 + 90 min)
  expect(screen.getByText('09:00 → 10:30')).toBeInTheDocument()
  // No pickers (TimeScrollPicker mock renders as a button with the time value)
  expect(screen.queryByRole('button', { name: '09:00' })).toBeNull()
})
```

Also add a new test for the unlocked display format:
```typescript
test('shows start→end time for read-only card (no onTimeChange)', () => {
  render(<ItineraryCard place={BASE_PLACE} index={0} />)
  // BASE_PLACE: startTime=09:00, durationMin=90 → end=10:30
  expect(screen.getByText('09:00 → 10:30')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify FAIL before implementation**

```bash
npx jest __tests__/itinerary-card-info.test.tsx --no-coverage
```
Expected: FAIL — the existing "停留 90 分鐘" assertion will fail; the new start→end test will fail.

- [ ] **Step 3: Update `components/ItineraryCard.tsx`**

Replace the imports block (first 6 lines) with:
```tsx
'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeScrollPicker } from './TimeScrollPicker'
import { getTodayHours } from '@/lib/utils/hours'
import { addMinutes } from '@/lib/utils/time'
import type { PlaceType, ScheduledPlace } from '@/lib/types'
```

Replace the entire `<div className="flex gap-4 mt-1 flex-wrap">…</div>` block with:
```tsx
<div className="flex items-center gap-1 mt-1 flex-wrap">
  {place.timeLocked ? (
    <p className="text-sm text-gray-500">
      {place.startTime} → {addMinutes(place.startTime, place.durationMin)}
    </p>
  ) : onTimeChange ? (
    <>
      <TimeScrollPicker
        value={place.startTime}
        onChange={(v) => onTimeChange(place.id, 'startTime', v)}
      />
      <span className="text-gray-400 text-sm">→</span>
      <TimeScrollPicker
        value={addMinutes(place.startTime, place.durationMin)}
        onChange={(v) => {
          const [eh, em] = v.split(':').map(Number)
          const [sh, sm] = place.startTime.split(':').map(Number)
          const dur = eh * 60 + em - (sh * 60 + sm)
          if (dur > 0) onTimeChange(place.id, 'durationMin', dur)
        }}
      />
    </>
  ) : (
    <p className="text-sm text-gray-500">
      {place.startTime} → {addMinutes(place.startTime, place.durationMin)}
    </p>
  )}
</div>
```

- [ ] **Step 4: Delete `components/TimeEditor.tsx`**

```bash
rm /mnt/d/vibe_coding_project/food_map/superpowers_food_map/components/TimeEditor.tsx
```

- [ ] **Step 5: Run card tests to verify PASS**

```bash
npx jest __tests__/itinerary-card-info.test.tsx --no-coverage
```
Expected: all tests PASS

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage
```
Expected: 93 tests PASS (no regressions; the deleted TimeEditor.tsx has no test file)

- [ ] **Step 7: Commit**

```bash
git add components/ItineraryCard.tsx components/TimeScrollPicker.tsx __tests__/itinerary-card-info.test.tsx
git rm components/TimeEditor.tsx
git commit -m "feat: replace TimeEditor with TimeScrollPicker, display HH:MM→HH:MM on all cards"
```

---

### Task 6: PlaceSearchBar + Itinerary Page Inputs

**Files:**
- Create: `components/PlaceSearchBar.tsx`
- Modify: `app/itinerary/ItineraryClient.tsx`

**What `PlaceSearchBar` does:**
- Props: `onAdd: (place: Place) => void`
- Text input + search button (🔍)
- On submit: call `searchPlace(query)` from `app/actions/places.ts`
- If found: show a result card (name, address, type badge) below the input; clicking it calls `onAdd(place)` and clears
- If not found: show "找不到此地點"
- While searching: button disabled with "搜尋中…" text
- On Enter key in input: also triggers search

**What changes in `ItineraryClient.tsx`:**
- Add import `{ findClosestDay }` from `@/lib/utils/geo`
- Add import `{ PlaceSearchBar }` from `@/components/PlaceSearchBar`
- Add import `{ ItineraryPasteInput }` from `@/components/ItineraryPasteInput`
- Add import `type { Place }` from `@/lib/types`
- Add `handleAddPlace` callback
- Add `handleAddPlaces` callback (for paste — assigns each place to its closest day)
- Render `<PlaceSearchBar>` + `<ItineraryPasteInput>` above the day list

- [ ] **Step 1: Create `components/PlaceSearchBar.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { searchPlace } from '@/app/actions/places'
import type { Place, PlaceType } from '@/lib/types'

const TYPE_LABEL: Record<PlaceType, string> = {
  attraction: '景點',
  restaurant: '餐廳',
  dessert: '甜點',
}

interface Props {
  onAdd: (place: Place) => void
}

export function PlaceSearchBar({ onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Place | null | 'not-found'>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    const place = await searchPlace(query.trim())
    setLoading(false)
    setResult(place ?? 'not-found')
  }

  const handleAdd = (place: Place) => {
    onAdd(place)
    setQuery('')
    setResult(null)
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="搜尋景點、餐廳或甜點…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '搜尋中…' : '🔍 搜尋'}
        </button>
      </div>
      {result === 'not-found' && (
        <p className="text-sm text-red-500 mt-2">找不到此地點</p>
      )}
      {result && result !== 'not-found' && (
        <button
          type="button"
          onClick={() => handleAdd(result)}
          className="mt-2 w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm">{result.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {TYPE_LABEL[result.type]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{result.address}</p>
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add `handleAddPlace` and `handleAddPlaces` to `ItineraryClient.tsx`**

Add these imports at the top of `app/itinerary/ItineraryClient.tsx` (after existing imports):
```typescript
import { findClosestDay } from '@/lib/utils/geo'
import { PlaceSearchBar } from '@/components/PlaceSearchBar'
import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'
import type { Place } from '@/lib/types'
```

Add these callbacks inside the component (after `handleTimeChange`):

```typescript
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
```

- [ ] **Step 3: Add the input section to the `return` JSX**

In `ItineraryClient.tsx`, inside the `<main>` element, add this section BEFORE the `<DndContext>` block:

```tsx
<section className="mb-8 space-y-3">
  <h2 className="text-sm font-semibold text-gray-700">新增行程</h2>
  <PlaceSearchBar onAdd={handleAddPlace} />
  <ItineraryPasteInput onPlacesFound={handleAddPlaces} />
</section>
```

- [ ] **Step 4: Run full test suite**

```bash
npx jest --no-coverage
```
Expected: 93 tests PASS (PlaceSearchBar has no unit test file — it calls a server action and is best verified manually; the existing tests for ItineraryClient indirectly pass since the component still renders)

- [ ] **Step 5: Commit**

```bash
git add components/PlaceSearchBar.tsx app/itinerary/ItineraryClient.tsx
git commit -m "feat: add PlaceSearchBar and paste input to itinerary page, assign by closest day"
```
