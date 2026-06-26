# 甜點類別 + 時間鎖定 + 超出營業時間提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `dessert` place type with pink badge, a per-card time-lock toggle that prevents auto-recalculation, and a `lateExit` warning when start + duration exceeds closing time.

**Architecture:** `ScheduledPlace` gains two new required boolean fields (`lateExit`, `timeLocked`) and `PlaceType` gains `'dessert'`. A new `checkLateExit` utility in `lib/utils/hours.ts` is shared by scheduler and client recalc. The lock toggle lives in `ItineraryCard` and propagates up through `ItineraryDay` to `ItineraryClient`, which respects it in `scheduleRecalc`.

**Tech Stack:** Next.js 14 App Router, React, TypeScript strict, Jest + jsdom, Tailwind CSS.

## Global Constraints

- All tests in `__tests__/` matching `testMatch: ['<rootDir>/__tests__/**/*.{ts,tsx}']`
- Component tests needing DOM require `/** @jest-environment jsdom */` as the first line
- TypeScript strict — no `any`, `npx tsc --noEmit` must be clean after each task
- Traditional Chinese UI copy throughout
- No new npm dependencies
- `dessert` default dwell time = 60 minutes (same as restaurant)
- Badge colors: 景點 = blue (`bg-blue-100 text-blue-700`), 餐廳 = orange (`bg-orange-100 text-orange-700`), 甜點 = pink (`bg-pink-100 text-pink-700`)
- `timeLocked: true` → both `startTime` and `durationMin` are frozen during `scheduleRecalc`; the cursor advances past the locked place using its existing values
- `lateExit` is recomputed by `scheduleRecalc` on every recalc (client-side); `outsideHours` is set at initial server-side schedule time only

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `lib/types.ts` | Modify | Add `'dessert'` to `PlaceType`; add `lateExit` + `timeLocked` to `ScheduledPlace` |
| `lib/utils/hours.ts` | Modify | Add `checkLateExit` utility |
| `__tests__/today-hours.test.ts` | Modify | Add `checkLateExit` tests |
| `__tests__/map-url.test.ts` | Modify | Add `lateExit: false, timeLocked: false` to `makePlace` |
| `__tests__/drag-containers.test.ts` | Modify | Add `lateExit: false, timeLocked: false` to `makePlace` |
| `__tests__/itinerary-day-embed.test.tsx` | Modify | Add `lateExit: false, timeLocked: false` to `makePlace` |
| `__tests__/itinerary-card-info.test.tsx` | Modify | Add fields to `BASE_PLACE`; new tests for dessert, lock, lateExit |
| `app/actions/schedule.ts` | Modify | `DWELL['dessert']=60`; dessert in attractions bucket; add `lateExit`+`timeLocked` to output |
| `app/actions/ai.ts` | Modify | Update `extractItinerary` prompt to include `dessert` type |
| `components/ItineraryPasteInput.tsx` | Modify | Accept `'dessert'` as valid type; dessert dwell = 60 |
| `components/RecommendPanel.tsx` | Modify | Add `lateExit: false, timeLocked: false`; include `'dessert'` in type cast; dessert dwell = 60 |
| `app/test-drag/page.tsx` | Modify | Add `lateExit: false, timeLocked: false` to all fixtures |
| `components/ItineraryCard.tsx` | Modify | Dessert badge; lock icon toggle; static display when locked; `lateExit` warning |
| `components/ItineraryDay.tsx` | Modify | Thread `onToggleLock` prop through to `ItineraryCard` |
| `app/itinerary/ItineraryClient.tsx` | Modify | `handleToggleLock`; updated `scheduleRecalc` with lock + `lateExit` |

---

### Task 1: Data layer — types + `checkLateExit` + fix all construction sites

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/utils/hours.ts`
- Modify: `__tests__/today-hours.test.ts`
- Modify: `__tests__/map-url.test.ts`
- Modify: `__tests__/drag-containers.test.ts`
- Modify: `__tests__/itinerary-day-embed.test.tsx`
- Modify: `__tests__/itinerary-card-info.test.tsx`
- Modify: `app/test-drag/page.tsx`

**Interfaces:**
- Produces:
  - `PlaceType = 'attraction' | 'restaurant' | 'dessert'`
  - `ScheduledPlace.lateExit: boolean`
  - `ScheduledPlace.timeLocked: boolean`
  - `checkLateExit(startTime: string, durationMin: number, openingHours: string[] | null): boolean` — from `@/lib/utils/hours`

---

- [ ] **Step 1: Write the failing `checkLateExit` tests**

Add to the end of `__tests__/today-hours.test.ts`:

```typescript
import { getTodayHours, checkLateExit } from '@/lib/utils/hours'

// --- existing getTodayHours tests stay above unchanged ---

describe('checkLateExit', () => {
  test('returns false for null openingHours', () => {
    expect(checkLateExit('09:00', 90, null)).toBe(false)
  })

  test('returns false for empty array', () => {
    expect(checkLateExit('09:00', 90, [])).toBe(false)
  })

  test('returns false when end time is before closing', () => {
    // start 09:00 + 90min = 10:30, close 17:00 → not late
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
    expect(checkLateExit('09:00', 90, hours)).toBe(false)
    spy.mockRestore()
  })

  test('returns false when end time equals closing exactly', () => {
    // start 15:30 + 90min = 17:00, close 17:00 → not late (exactly at close)
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
    expect(checkLateExit('15:30', 90, hours)).toBe(false)
    spy.mockRestore()
  })

  test('returns true when end time exceeds closing by 1 minute', () => {
    // start 15:31 + 90min = 17:01, close 17:00 → late
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
    expect(checkLateExit('15:31', 90, hours)).toBe(true)
    spy.mockRestore()
  })

  test('returns true when entire visit is after closing', () => {
    // start 18:00 + 60min = 19:00, close 17:00 → late
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
    expect(checkLateExit('18:00', 60, hours)).toBe(true)
    spy.mockRestore()
  })

  test('handles Chinese 24h format (星期一：09:00–17:00)', () => {
    // start 15:31 + 90min = 17:01, close 17:00 → late
    const hours = Array(7).fill('星期一：09:00–17:00')
    const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
    expect(checkLateExit('15:31', 90, hours)).toBe(true)
    spy.mockRestore()
  })

  test('returns false for Closed entry', () => {
    const hours = Array(7).fill('Monday: Closed')
    const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
    expect(checkLateExit('09:00', 90, hours)).toBe(false)
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx jest __tests__/today-hours.test.ts --no-coverage
```

Expected: FAIL — `checkLateExit is not a function` (export doesn't exist yet).

- [ ] **Step 3: Update `lib/types.ts`**

Replace the full file:

```typescript
export type PlaceType = 'attraction' | 'restaurant' | 'dessert'
export type TransportMode = 'driving' | 'walking' | 'transit'

export interface Place {
  id: string
  placeId: string
  name: string
  type: PlaceType
  lat: number
  lng: number
  address: string
  openingHours: string[] | null
  rating: number | null
  photoUrl: string | null
  description: string | null
}

export interface ScheduledPlace extends Place {
  startTime: string
  durationMin: number
  travelMinToNext: number | null
  aiDescription: string | null
  outsideHours: boolean
  lateExit: boolean      // startTime + durationMin exceeds today's closing time
  timeLocked: boolean    // recalc skips this place's startTime and durationMin
}

export interface DayItinerary {
  day: number
  places: ScheduledPlace[]
  aiSummary: string | null
}

export interface PlanResult {
  days: DayItinerary[]
  transportMode: TransportMode
}

export interface Recommendation {
  name: string
  type: PlaceType
  reason: string
  sourceLabel: string
  placeId: string | null
  lat: number | null
  lng: number | null
  verified: boolean
}

export interface Source {
  id: string
  url: string
  label: string
  lastFetchedAt: string | null
  lastFetchStatus: 'ok' | 'error' | null
}

export interface DistanceMatrix {
  indices: string[]
  matrix: number[][]
}
```

- [ ] **Step 4: Add `checkLateExit` to `lib/utils/hours.ts`**

Replace the full file:

```typescript
export function getTodayHours(openingHours: string[] | null): string | null {
  if (!openingHours || openingHours.length === 0) return null
  const idx = (new Date().getDay() + 6) % 7
  const entry = openingHours[idx]
  if (!entry) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  if (!rest) return null
  if (/closed|休息|不營業/i.test(rest)) return '休息'
  return rest
}

function getCloseMin(openingHours: string[] | null): number | null {
  if (!openingHours || openingHours.length === 0) return null
  const idx = (new Date().getDay() + 6) % 7
  const entry = openingHours[idx]
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return null
  // Strip day name prefix (handles ":" U+003A and "：" U+FF1A)
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  // Match "open – close" using en-dash or hyphen; capture the close part
  const match = rest.match(/^.+?[–-]\s*(.+)$/)
  if (!match) return null
  const closeStr = match[1].trim()
  // AM/PM format: "5:00 PM"
  const ampm = closeStr.match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = parseInt(ampm[2])
    const period = ampm[3].toUpperCase()
    if (period === 'PM' && h !== 12) h += 12
    if (period === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  // 24h format: "17:00"
  const plain = closeStr.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1]) * 60 + parseInt(plain[2])
  return null
}

export function checkLateExit(
  startTime: string,
  durationMin: number,
  openingHours: string[] | null
): boolean {
  const closeMin = getCloseMin(openingHours)
  if (closeMin === null) return false
  const [h, m] = startTime.split(':').map(Number)
  const endMin = h * 60 + m + durationMin
  return endMin > closeMin
}
```

- [ ] **Step 5: Run `checkLateExit` tests to verify they pass**

```bash
npx jest __tests__/today-hours.test.ts --no-coverage
```

Expected: all tests pass (existing `getTodayHours` tests + new `checkLateExit` tests).

- [ ] **Step 6: Fix TypeScript errors — add `lateExit`/`timeLocked` to all `ScheduledPlace` literals in tests**

Run `npx tsc --noEmit 2>&1 | head -40` to confirm which test files break. Fix them:

In `__tests__/map-url.test.ts`, update `makePlace`:

```typescript
function makePlace(lat: number, lng: number): ScheduledPlace {
  return {
    id: 'id', placeId: 'pid', name: 'Place', type: 'attraction',
    lat, lng, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
    lateExit: false, timeLocked: false,
  }
}
```

In `__tests__/drag-containers.test.ts`, update `makePlace`:

```typescript
function makePlace(id: string): ScheduledPlace {
  return {
    id, placeId: id, name: id, type: 'attraction',
    lat: 25, lng: 121, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
    lateExit: false, timeLocked: false,
  }
}
```

In `__tests__/itinerary-day-embed.test.tsx`, update `makePlace`:

```typescript
function makePlace(name: string): ScheduledPlace {
  return {
    id: name, placeId: name, name, type: 'attraction',
    lat: 25, lng: 121, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
    lateExit: false, timeLocked: false,
  }
}
```

In `__tests__/itinerary-card-info.test.tsx`, update `BASE_PLACE`:

```typescript
const BASE_PLACE: ScheduledPlace = {
  id: 'id-1',
  placeId: 'pid-1',
  name: '測試景點',
  type: 'attraction',
  lat: 25.04,
  lng: 121.56,
  address: '地址',
  openingHours: ['Monday: 9:00 AM – 5:00 PM'],
  rating: 4.5,
  photoUrl: null,
  description: null,
  startTime: '09:00',
  durationMin: 90,
  travelMinToNext: 15,
  aiDescription: null,
  outsideHours: false,
  lateExit: false,
  timeLocked: false,
}
```

- [ ] **Step 7: Fix `app/test-drag/page.tsx` — add missing fields**

Open `app/test-drag/page.tsx` and add `lateExit: false, timeLocked: false` to every place object literal in that file (there are 4 fixture places). The exact lines to update are where `outsideHours: false` currently sits — add the two new fields immediately after:

```typescript
    outsideHours: false,
    lateExit: false,
    timeLocked: false,
```

Apply that pattern to all 4 place objects in the file.

- [ ] **Step 8: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: errors only in `app/actions/schedule.ts`, `components/RecommendPanel.tsx` — those are fixed in Task 2. No errors in `lib/` or `__tests__/`.

- [ ] **Step 9: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -6
```

Expected: all existing tests pass.

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/utils/hours.ts \
  __tests__/today-hours.test.ts __tests__/map-url.test.ts \
  __tests__/drag-containers.test.ts __tests__/itinerary-day-embed.test.tsx \
  __tests__/itinerary-card-info.test.tsx app/test-drag/page.tsx
git commit -m "feat: add dessert PlaceType, lateExit+timeLocked fields, checkLateExit utility"
```

---

### Task 2: Scheduler + paste input + RecommendPanel

**Files:**
- Modify: `app/actions/schedule.ts`
- Modify: `app/actions/ai.ts`
- Modify: `components/ItineraryPasteInput.tsx`
- Modify: `components/RecommendPanel.tsx`

**Interfaces:**
- Consumes:
  - `PlaceType = 'attraction' | 'restaurant' | 'dessert'` from `@/lib/types`
  - `checkLateExit(startTime, durationMin, openingHours): boolean` from `@/lib/utils/hours`
- Produces: all `ScheduledPlace` construction sites return objects with `lateExit` and `timeLocked`; `dessert` is a valid extracted type

---

- [ ] **Step 1: Update `app/actions/schedule.ts`**

Replace the full file:

```typescript
'use server'
import type { Place, ScheduledPlace, DayItinerary, DistanceMatrix } from '@/lib/types'
import { checkLateExit } from '@/lib/utils/hours'

const DWELL: Record<string, number> = { attraction: 90, restaurant: 60, dessert: 60 }
const DAY_START = 9 * 60

function isOutsideHours(startTime: string, openingHours: string[] | null): boolean {
  if (!openingHours) return false
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = days[new Date().getDay()]
  const todayHours = openingHours.find((h) => h.startsWith(today))
  if (!todayHours) return false
  const match = todayHours.match(/(\d+:\d+\s*[AP]M)\s*[–-]\s*(\d+:\d+\s*[AP]M)/)
  if (!match) return false
  const toMins = (t: string) => {
    const [time, period] = t.trim().split(/\s+/)
    const [h, m] = time.split(':').map(Number)
    return ((period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h) * 60) + m
  }
  const openMin = toMins(match[1])
  const closeMin = toMins(match[2])
  const [sh, sm] = startTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  return startMin < openMin || startMin >= closeMin
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function travelSecs(
  aIdx: number,
  bIdx: number,
  matrix: DistanceMatrix,
  placeIds: string[]
): number {
  const i = matrix.indices.indexOf(placeIds[aIdx])
  const j = matrix.indices.indexOf(placeIds[bIdx])
  if (i === -1 || j === -1) return 0
  return matrix.matrix[i][j]
}

export async function schedulePlaces(
  orderedPlaces: Place[],
  distMatrix: DistanceMatrix,
  days: number
): Promise<DayItinerary[]> {
  const chunkSize = Math.ceil(orderedPlaces.length / days)
  const dayChunks: Place[][] = Array.from({ length: days }, (_, d) =>
    orderedPlaces.slice(d * chunkSize, (d + 1) * chunkSize)
  )

  return dayChunks.map((chunk, dayIdx) => {
    const placeIds = chunk.map((p) => p.placeId)

    // Desserts flow freely like attractions (not pinned to meal slots)
    const attractions = chunk.filter((p) => p.type === 'attraction' || p.type === 'dessert')
    const restaurants = chunk.filter((p) => p.type === 'restaurant')

    const lunchRestaurant = restaurants[0] ?? null
    const dinnerRestaurant = restaurants[1] ?? null
    const extraRestaurants = restaurants.slice(2)

    const amAttractions = attractions.slice(0, Math.ceil(attractions.length / 2))
    const pmAttractions = [
      ...attractions.slice(Math.ceil(attractions.length / 2)),
      ...extraRestaurants,
    ]

    const ordered: Place[] = [
      ...amAttractions,
      ...(lunchRestaurant ? [lunchRestaurant] : []),
      ...pmAttractions,
      ...(dinnerRestaurant ? [dinnerRestaurant] : []),
    ]

    let cursor = DAY_START

    const scheduled: ScheduledPlace[] = ordered.map((place, i) => {
      if (place === lunchRestaurant && cursor < 12 * 60) cursor = 12 * 60
      if (place === dinnerRestaurant && cursor < 18 * 60) cursor = 18 * 60

      const startTime = minsToTime(cursor)
      const durationMin = DWELL[place.type]

      const travelMin =
        i < ordered.length - 1
          ? Math.round(
              travelSecs(
                placeIds.indexOf(place.placeId),
                placeIds.indexOf(ordered[i + 1].placeId),
                distMatrix,
                placeIds
              ) / 60
            )
          : null

      const outsideHours = isOutsideHours(startTime, place.openingHours)
      const lateExit = checkLateExit(startTime, durationMin, place.openingHours)
      cursor += durationMin + (travelMin ?? 0)

      return {
        ...place,
        startTime,
        durationMin,
        travelMinToNext: travelMin,
        aiDescription: null,
        outsideHours,
        lateExit,
        timeLocked: false,
      }
    })

    return { day: dayIdx + 1, places: scheduled, aiSummary: null }
  })
}
```

- [ ] **Step 2: Update `app/actions/ai.ts` — add dessert to the extractItinerary prompt**

Find the `extractItinerary` function and replace only its `prompt` string:

```typescript
  const prompt = `你是旅遊助理。以下是一段旅遊行程文字。請：
1. 找出所有景點、餐廳和甜點名稱
2. 判斷每個地點的類型：景點(attraction)、餐廳(restaurant)、甜點(dessert)
3. 判斷行程的國家（例如 Taiwan、Japan、South Korea）

回傳純 JSON，不要包含 markdown 或其他說明：
{
  "country": "Japan",
  "countryCode": "jp",
  "places": [
    { "name": "地點名稱", "type": "attraction" }
  ]
}

若無法判斷國家，country 和 countryCode 設為 null。
若無法判斷地點類型，設為 attraction。

行程文字：
${text}`
```

- [ ] **Step 3: Update `components/ItineraryPasteInput.tsx` — accept dessert type**

Find this line:

```typescript
        const validType: PlaceType = p.type === 'restaurant' ? 'restaurant' : 'attraction'
```

Replace with:

```typescript
        const validType: PlaceType =
          p.type === 'restaurant' ? 'restaurant' :
          p.type === 'dessert' ? 'dessert' :
          'attraction'
```

- [ ] **Step 4: Update `components/RecommendPanel.tsx` — add missing fields + dessert support**

Find the `toAdd` map block and replace only the mapped object:

```typescript
      .map((r) => ({
        id: crypto.randomUUID(),
        placeId: r.placeId as string,
        name: r.name,
        type: r.type,
        lat: r.lat as number,
        lng: r.lng as number,
        address: '',
        openingHours: null,
        rating: null,
        photoUrl: null,
        description: null,
        startTime: '09:00',
        durationMin: r.type === 'attraction' ? 90 : 60,
        travelMinToNext: null,
        aiDescription: r.reason,
        outsideHours: false,
        lateExit: false,
        timeLocked: false,
      }))
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/actions/schedule.ts app/actions/ai.ts \
  components/ItineraryPasteInput.tsx components/RecommendPanel.tsx
git commit -m "feat: add dessert scheduling, update AI prompt and paste input for dessert type"
```

---

### Task 3: Card UI — dessert badge, lock toggle, lateExit warning

**Files:**
- Modify: `components/ItineraryCard.tsx`
- Modify: `components/ItineraryDay.tsx`
- Modify: `__tests__/itinerary-card-info.test.tsx`

**Interfaces:**
- Consumes:
  - `ScheduledPlace.timeLocked: boolean`
  - `ScheduledPlace.lateExit: boolean`
  - `ScheduledPlace.type: PlaceType` (now includes `'dessert'`)
- `ItineraryCard` new prop: `onToggleLock?: (placeId: string) => void`
- `ItineraryDay` new prop: `onToggleLock?: (placeId: string) => void`

---

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/itinerary-card-info.test.tsx` (after existing imports, update them to include `fireEvent`):

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
```

Add these new tests at the end of the file (after the existing 6 tests):

```typescript
test('shows 甜點 badge with pink style for dessert type', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, type: 'dessert' }} index={0} />)
  const badge = screen.getByText('甜點')
  expect(badge).toBeInTheDocument()
  expect(badge.className).toContain('bg-pink-100')
  expect(badge.className).toContain('text-pink-700')
})

test('renders lock button when onToggleLock is provided', () => {
  const mockToggle = jest.fn()
  render(<ItineraryCard place={BASE_PLACE} index={0} onToggleLock={mockToggle} />)
  expect(screen.getByRole('button', { name: '鎖定時間' })).toBeInTheDocument()
})

test('clicking lock button calls onToggleLock with place id', () => {
  const mockToggle = jest.fn()
  render(<ItineraryCard place={BASE_PLACE} index={0} onToggleLock={mockToggle} />)
  fireEvent.click(screen.getByRole('button', { name: '鎖定時間' }))
  expect(mockToggle).toHaveBeenCalledWith('id-1')
})

test('shows 解鎖時間 aria-label when timeLocked is true', () => {
  render(
    <ItineraryCard
      place={{ ...BASE_PLACE, timeLocked: true }}
      index={0}
      onToggleLock={jest.fn()}
    />
  )
  expect(screen.getByRole('button', { name: '解鎖時間' })).toBeInTheDocument()
})

test('hides TimeEditors and shows static time text when timeLocked', () => {
  render(
    <ItineraryCard
      place={{ ...BASE_PLACE, timeLocked: true }}
      index={0}
      onTimeChange={jest.fn()}
      onToggleLock={jest.fn()}
    />
  )
  // Static text visible
  expect(screen.getByText(/09:00 · 停留 90 分鐘/)).toBeInTheDocument()
  // No editable time buttons (TimeEditor renders as a button with "開始:" prefix)
  expect(screen.queryByRole('button', { name: /開始:/ })).toBeNull()
})

test('shows lateExit warning when lateExit is true', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, lateExit: true }} index={0} />)
  expect(screen.getByText(/結束時間超出營業時間/)).toBeInTheDocument()
})

test('does not show lateExit warning when lateExit is false', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, lateExit: false }} index={0} />)
  expect(screen.queryByText(/結束時間超出營業時間/)).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/itinerary-card-info.test.tsx --no-coverage
```

Expected: FAIL — new tests reference props/elements that don't exist yet.

- [ ] **Step 3: Replace `components/ItineraryCard.tsx`**

```tsx
'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import { getTodayHours } from '@/lib/utils/hours'
import type { PlaceType, ScheduledPlace } from '@/lib/types'

const TYPE_STYLE: Record<PlaceType, { bg: string; text: string; label: string }> = {
  attraction: { bg: 'bg-blue-100', text: 'text-blue-700', label: '景點' },
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700', label: '餐廳' },
  dessert:    { bg: 'bg-pink-100',  text: 'text-pink-700',  label: '甜點' },
}

interface Props {
  place: ScheduledPlace
  index: number
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleLock?: (placeId: string) => void
}

export function ItineraryCard({ place, index, draggable, onTimeChange, onToggleLock }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const todayHours = getTodayHours(place.openingHours)
  const descriptionText = place.description || place.aiDescription
  const typeStyle = TYPE_STYLE[place.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-xl p-4 ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
      data-testid={`card-${place.id}`}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-1 select-none"
            data-testid="drag-handle"
          >&#x2807;</span>
        )}
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{place.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeStyle.bg} ${typeStyle.text}`}>
              {typeStyle.label}
            </span>
            {place.outsideHours && (
              <span className="text-xs text-orange-600 font-medium">&#x26A0; 請確認營業時間</span>
            )}
          </div>
          <div className="flex gap-4 mt-1 flex-wrap">
            {place.timeLocked ? (
              <p className="text-sm text-gray-500">
                {place.startTime} · 停留 {place.durationMin} 分鐘
              </p>
            ) : onTimeChange ? (
              <>
                <TimeEditor
                  value={place.startTime}
                  label="開始"
                  onChange={(v) => onTimeChange(place.id, 'startTime', v)}
                />
                <TimeEditor
                  value={`${Math.floor(place.durationMin / 60).toString().padStart(2, '0')}:${(place.durationMin % 60).toString().padStart(2, '0')}`}
                  label="停留"
                  onChange={(v) => {
                    const [h, m] = v.split(':').map(Number)
                    onTimeChange(place.id, 'durationMin', h * 60 + m)
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-gray-500">{place.startTime} · 停留 {place.durationMin} 分鐘</p>
            )}
          </div>
          {todayHours && (
            <p className="text-sm text-gray-500 mt-0.5">今日 {todayHours}</p>
          )}
          {place.rating && (
            <p className="text-sm text-gray-500 mt-0.5">評分：{place.rating} &#x2605;</p>
          )}
          {descriptionText && (
            <p className="text-sm text-gray-600 mt-2 italic">{descriptionText}</p>
          )}
          {place.lateExit && (
            <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 結束時間超出營業時間</p>
          )}
        </div>
        {onToggleLock && (
          <button
            onClick={() => onToggleLock(place.id)}
            className="text-xl leading-none mt-0.5 opacity-50 hover:opacity-100 transition-opacity shrink-0"
            aria-label={place.timeLocked ? '解鎖時間' : '鎖定時間'}
          >
            {place.timeLocked ? '🔒' : '🔓'}
          </button>
        )}
      </div>
      {place.travelMinToNext !== null && place.travelMinToNext > 0 && (
        <p className="text-xs text-gray-400 mt-3 pl-10">&#x2192; 前往下一站約 {place.travelMinToNext} 分鐘</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `components/ItineraryDay.tsx` — thread `onToggleLock`**

Replace the full file:

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
  isDragging?: boolean
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleLock?: (placeId: string) => void
}

export function ItineraryDay({ day, dayIdx, mode, isDragging, draggable, onTimeChange, onToggleLock }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIdx}` })

  return (
    <section className="mb-12" data-testid={`day-${dayIdx}`}>
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="flex gap-6 items-start">
        <div
          ref={setNodeRef}
          className={`flex-1 space-y-3 rounded-lg transition-colors min-h-[60px] ${isOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
        >
          {day.places.map((place, i) => (
            <ItineraryCard
              key={place.id}
              place={place}
              index={i}
              draggable={draggable}
              onTimeChange={onTimeChange}
              onToggleLock={onToggleLock}
            />
          ))}
        </div>
        {embedUrl && (
          <div className="w-96 shrink-0 sticky top-4 rounded-xl overflow-hidden border border-gray-200">
            <iframe
              src={embedUrl}
              width="100%"
              height="500"
              style={{ border: 0, pointerEvents: isDragging ? 'none' : 'auto' }}
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

- [ ] **Step 5: Run card tests to verify they pass**

```bash
npx jest __tests__/itinerary-card-info.test.tsx --no-coverage
```

Expected: all tests pass (6 original + 7 new = 13 tests).

- [ ] **Step 6: Run full suite**

```bash
npx jest --no-coverage 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/ItineraryCard.tsx components/ItineraryDay.tsx \
  __tests__/itinerary-card-info.test.tsx
git commit -m "feat: dessert badge, time lock toggle, lateExit warning in ItineraryCard"
```

---

### Task 4: Client lock logic + `scheduleRecalc` with `lateExit`

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx`

**Interfaces:**
- Consumes:
  - `checkLateExit(startTime, durationMin, openingHours): boolean` from `@/lib/utils/hours`
  - `ScheduledPlace.timeLocked: boolean`
  - `ItineraryDay` prop `onToggleLock?: (placeId: string) => void`

---

- [ ] **Step 1: Replace `app/itinerary/ItineraryClient.tsx`**

```tsx
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
import type { PlanResult, ScheduledPlace } from '@/lib/types'
import { checkLateExit } from '@/lib/utils/hours'
import { ItineraryDay } from '@/components/ItineraryDay'
import { ItineraryCard } from '@/components/ItineraryCard'
import { RecommendPanel } from '@/components/RecommendPanel'
import { applyDragResult, findContainer } from '@/lib/utils/dragContainers'

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
  const planRef = useRef<PlanResult>(initial)
  const savedPlanRef = useRef<PlanResult>(initial)
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
      const recalced: PlanResult = {
        ...nextPlan,
        days: nextPlan.days.map((day) => {
          let cursor = 9 * 60
          const places: ScheduledPlace[] = day.places.map((p) => {
            if (p.timeLocked) {
              // Locked place: keep startTime and durationMin, advance cursor past it
              const [h, m] = p.startTime.split(':').map(Number)
              cursor = h * 60 + m + p.durationMin + (p.travelMinToNext ?? 0)
              return { ...p, lateExit: checkLateExit(p.startTime, p.durationMin, p.openingHours) }
            }
            const startMins = cursor
            const startTime = `${String(Math.floor(startMins / 60)).padStart(2, '0')}:${String(startMins % 60).padStart(2, '0')}`
            cursor += p.durationMin + (p.travelMinToNext ?? 0)
            return {
              ...p,
              startTime,
              lateExit: checkLateExit(startTime, p.durationMin, p.openingHours),
            }
          })
          return { ...day, places }
        }),
      }
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

  const allPlaces = plan.days.flatMap((d) => d.places)
  const activePlace = activeId ? allPlaces.find(p => p.id === activeId) ?? null : null
  const activePlaceIndex = activeId ? allPlaces.findIndex(p => p.id === activeId) : -1

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <a href="/" className="text-blue-600 text-sm mb-6 inline-block">&#x2190; 重新規劃</a>
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
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx
git commit -m "feat: handleToggleLock and lateExit-aware scheduleRecalc in ItineraryClient"
```
