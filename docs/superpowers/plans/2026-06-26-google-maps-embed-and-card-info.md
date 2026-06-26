# Google Maps Embed Routing + Card Info Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the straight-line custom map with per-day Google Maps Embed iframes showing real road routing, and update each itinerary card to show today's opening hours and a description (no ticket price label).

**Architecture:** Two utility functions (`buildDayEmbedUrl`, `getTodayHours`) handle all data transformation. `ItineraryDay` gains a `mode` prop and renders an iframe. `ItineraryCard` gains opening hours and uses `description || aiDescription`. The single shared `MapView` is removed entirely; the `ticketPrice` field is renamed `description` throughout.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Google Maps Embed API (free, no per-call charge), `@testing-library/react`, Jest with jsdom.

## Global Constraints

- All tests live in `__tests__/` and match `testMatch: ['<rootDir>/__tests__/**/*.{ts,tsx}']`
- Component tests needing DOM require `/** @jest-environment jsdom */` as the first line
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is the env var for the Maps Embed API key (already exists in `.env.local`)
- No new npm dependencies
- Google Maps Embed API must be enabled in Google Cloud Console (same project as the existing key) — note this in a code comment where the URL is built
- Traditional Chinese UI copy throughout
- `ticketPrice` is renamed `description` everywhere — do not leave any `ticketPrice` references after Task 1

---

### Task 1: Data layer — rename `ticketPrice` → `description`, add utility functions

**Files:**
- Modify: `lib/types.ts`
- Modify: `app/actions/places.ts`
- Create: `lib/utils/mapUrl.ts`
- Create: `lib/utils/hours.ts`
- Create: `__tests__/map-url.test.ts`
- Create: `__tests__/today-hours.test.ts`

**Interfaces:**
- Produces:
  - `buildDayEmbedUrl(places: ScheduledPlace[], mode: TransportMode): string` — from `lib/utils/mapUrl.ts`
  - `getTodayHours(openingHours: string[] | null): string | null` — from `lib/utils/hours.ts`
  - `Place.description: string | null` replaces `Place.ticketPrice: string | null` — from `lib/types.ts`

---

- [ ] **Step 1: Write the failing tests**

Create `__tests__/map-url.test.ts`:

```typescript
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import type { ScheduledPlace } from '@/lib/types'

process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'TEST_KEY'

function makePlace(lat: number, lng: number): ScheduledPlace {
  return {
    id: 'id', placeId: 'pid', name: 'Place', type: 'attraction',
    lat, lng, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
  }
}

test('returns empty string for 0 places', () => {
  expect(buildDayEmbedUrl([], 'driving')).toBe('')
})

test('returns empty string for 1 place', () => {
  expect(buildDayEmbedUrl([makePlace(25.04, 121.56)], 'driving')).toBe('')
})

test('builds valid URL for 2 places with no waypoints', () => {
  const url = buildDayEmbedUrl(
    [makePlace(25.04, 121.56), makePlace(25.05, 121.57)],
    'driving'
  )
  expect(url).toContain('maps.google.com/maps/embed/v1/directions')
  expect(url).toContain('key=TEST_KEY')
  expect(url).toContain('origin=')
  expect(url).toContain('destination=')
  expect(url).not.toContain('waypoints=')
  expect(url).toContain('mode=driving')
})

test('includes waypoints for 3+ places', () => {
  const url = buildDayEmbedUrl(
    [makePlace(25.04, 121.56), makePlace(25.05, 121.57), makePlace(25.06, 121.58)],
    'walking'
  )
  expect(url).toContain('waypoints=')
  expect(url).toContain('mode=walking')
})

test('maps transit mode correctly', () => {
  const url = buildDayEmbedUrl(
    [makePlace(25.04, 121.56), makePlace(25.05, 121.57)],
    'transit'
  )
  expect(url).toContain('mode=transit')
})
```

Create `__tests__/today-hours.test.ts`:

```typescript
import { getTodayHours } from '@/lib/utils/hours'

test('returns null for null input', () => {
  expect(getTodayHours(null)).toBeNull()
})

test('returns null for empty array', () => {
  expect(getTodayHours([])).toBeNull()
})

test('extracts hours for Monday (getDay=1 → index 0)', () => {
  const hours = [
    'Monday: 9:00 AM – 5:00 PM',
    'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM',
    'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM',
    'Saturday: 10:00 AM – 6:00 PM',
    'Sunday: Closed',
  ]
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
  expect(getTodayHours(hours)).toBe('9:00 AM – 5:00 PM')
  spy.mockRestore()
})

test('extracts hours for Sunday (getDay=0 → index 6)', () => {
  const hours = [
    'Monday: 9:00 AM – 5:00 PM',
    'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM',
    'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM',
    'Saturday: 10:00 AM – 6:00 PM',
    'Sunday: 11:00 AM – 4:00 PM',
  ]
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(0)
  expect(getTodayHours(hours)).toBe('11:00 AM – 4:00 PM')
  spy.mockRestore()
})

test('returns "休息" for Closed entry', () => {
  const hours = Array(7).fill('Monday: Closed')
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
  expect(getTodayHours(hours)).toBe('休息')
  spy.mockRestore()
})

test('handles Chinese format with full-width colon', () => {
  // Google returns zh-TW format: "星期一：09:00–17:00"
  const hours = Array(7).fill('星期一：09:00–17:00')
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
  expect(getTodayHours(hours)).toBe('09:00–17:00')
  spy.mockRestore()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/map-url.test.ts __tests__/today-hours.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/utils/mapUrl'` and `'@/lib/utils/hours'`

- [ ] **Step 3: Rename `ticketPrice` → `description` in `lib/types.ts`**

Replace the `ticketPrice` line in the `Place` interface:

```typescript
// lib/types.ts — full file
export type PlaceType = 'attraction' | 'restaurant'
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
  description: string | null   // from Google editorial_summary.overview; null if unavailable
}

export interface ScheduledPlace extends Place {
  startTime: string
  durationMin: number
  travelMinToNext: number | null
  aiDescription: string | null
  outsideHours: boolean
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

- [ ] **Step 4: Update `app/actions/places.ts` — field rename only**

Change line 32 from `ticketPrice: r.editorial_summary?.overview ?? null` to `description`:

```typescript
// app/actions/places.ts — full file
'use server'
import type { Place } from '@/lib/types'
import { randomUUID } from 'crypto'

const KEY = process.env.GOOGLE_MAPS_API_KEY!
const BASE = 'https://maps.googleapis.com/maps/api/place'

export async function getPlaceDetails(placeId: string): Promise<Place | null> {
  const fields = [
    'place_id', 'name', 'geometry', 'formatted_address',
    'opening_hours', 'rating', 'photos', 'editorial_summary',
  ].join(',')
  const url = `${BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${KEY}&language=zh-TW`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()
  if (data.status !== 'OK') return null
  const r = data.result

  return {
    id: randomUUID(),
    placeId,
    name: r.name,
    type: 'attraction',
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address ?? '',
    openingHours: r.opening_hours?.weekday_text ?? null,
    rating: r.rating ?? null,
    photoUrl: r.photos?.[0]
      ? `/api/photo?ref=${r.photos[0].photo_reference}`
      : null,
    description: r.editorial_summary?.overview ?? null,
  }
}

export async function searchPlace(query: string, countryName?: string): Promise<Place | null> {
  const input = countryName ? `${query}, ${countryName}` : query
  const url =
    `${BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(input)}&inputtype=textquery` +
    `&fields=place_id&key=${KEY}`
  const res = await fetch(url)
  const data = await res.json()
  const placeId = data.candidates?.[0]?.place_id
  if (!placeId) return null
  return getPlaceDetails(placeId)
}

export async function verifyPlace(
  name: string
): Promise<{ placeId: string; lat: number; lng: number } | null> {
  const place = await searchPlace(name)
  if (!place) return null
  return { placeId: place.placeId, lat: place.lat, lng: place.lng }
}
```

- [ ] **Step 5: Create `lib/utils/mapUrl.ts`**

```typescript
// lib/utils/mapUrl.ts
// Requires Maps Embed API enabled in Google Cloud Console (same project as GOOGLE_MAPS_API_KEY)
import type { ScheduledPlace, TransportMode } from '@/lib/types'

const EMBED_MODE: Record<TransportMode, string> = {
  driving: 'driving',
  walking: 'walking',
  transit: 'transit',
}

export function buildDayEmbedUrl(
  places: ScheduledPlace[],
  mode: TransportMode
): string {
  if (places.length < 2) return ''
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return ''
  const origin = encodeURIComponent(`${places[0].lat},${places[0].lng}`)
  const destination = encodeURIComponent(
    `${places[places.length - 1].lat},${places[places.length - 1].lng}`
  )
  const middle = places.slice(1, -1)
  const waypointsParam =
    middle.length > 0
      ? `&waypoints=${encodeURIComponent(middle.map((p) => `${p.lat},${p.lng}`).join('|'))}`
      : ''
  return (
    `https://maps.google.com/maps/embed/v1/directions` +
    `?key=${key}` +
    `&origin=${origin}` +
    `&destination=${destination}` +
    waypointsParam +
    `&mode=${EMBED_MODE[mode]}`
  )
}
```

- [ ] **Step 6: Create `lib/utils/hours.ts`**

```typescript
// lib/utils/hours.ts
export function getTodayHours(openingHours: string[] | null): string | null {
  if (!openingHours || openingHours.length === 0) return null
  // weekday_text: index 0 = Monday, index 6 = Sunday
  // Date.getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const idx = (new Date().getDay() + 6) % 7
  const entry = openingHours[idx]
  if (!entry) return null
  // Strip leading day name (handles both ":" U+003A and "：" U+FF1A)
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  if (!rest) return null
  if (/closed|休息|不營業/i.test(rest)) return '休息'
  return rest
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
npx jest __tests__/map-url.test.ts __tests__/today-hours.test.ts --no-coverage
```

Expected: 9 tests pass, 0 failures.

- [ ] **Step 8: Check TypeScript compiles with no errors from the rename**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: any errors shown are in files that still reference `ticketPrice`. Fix each: replace `place.ticketPrice` with `place.description` and `ticketPrice:` with `description:` in mock objects in existing tests. Common locations to check:
- `__tests__/schedule.test.ts` — mock `Place` objects may have `ticketPrice`
- `__tests__/itinerary-paste-input.test.tsx` — `MOCK_PLACE` object
- `__tests__/search-place-country.test.ts` — mock return values

For each file: find `ticketPrice` and rename to `description`.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts app/actions/places.ts lib/utils/mapUrl.ts lib/utils/hours.ts \
  __tests__/map-url.test.ts __tests__/today-hours.test.ts \
  __tests__/schedule.test.ts __tests__/itinerary-paste-input.test.tsx \
  __tests__/search-place-country.test.ts
git commit -m "feat: rename ticketPrice→description, add buildDayEmbedUrl and getTodayHours"
```

---

### Task 2: Update `ItineraryCard` — opening hours + description display

**Files:**
- Modify: `components/ItineraryCard.tsx`
- Create: `__tests__/itinerary-card-info.test.tsx`

**Interfaces:**
- Consumes:
  - `getTodayHours(openingHours: string[] | null): string | null` from `@/lib/utils/hours`
  - `ScheduledPlace.description: string | null` (renamed from Task 1)
  - `ScheduledPlace.aiDescription: string | null` (existing)

---

- [ ] **Step 1: Write the failing test**

Create `__tests__/itinerary-card-info.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import type { ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))
jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))
jest.mock('@/lib/utils/hours', () => ({
  getTodayHours: jest.fn(() => '9:00 AM – 5:00 PM'),
}))

import { ItineraryCard } from '@/components/ItineraryCard'

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
}

test('shows today opening hours', () => {
  render(<ItineraryCard place={BASE_PLACE} index={0} />)
  expect(screen.getByText(/今日.*9:00 AM/)).toBeInTheDocument()
})

test('shows Google description when available', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, description: 'Google 說明' }} index={0} />)
  expect(screen.getByText('Google 說明')).toBeInTheDocument()
})

test('falls back to aiDescription when description is null', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, description: null, aiDescription: 'AI 說明' }} index={0} />)
  expect(screen.getByText('AI 說明')).toBeInTheDocument()
})

test('shows Google description over aiDescription when both exist', () => {
  render(
    <ItineraryCard
      place={{ ...BASE_PLACE, description: 'Google 說明', aiDescription: 'AI 說明' }}
      index={0}
    />
  )
  expect(screen.getByText('Google 說明')).toBeInTheDocument()
  expect(screen.queryByText('AI 說明')).toBeNull()
})

test('does not render 票價 label', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, description: '某說明' }} index={0} />)
  expect(screen.queryByText(/票價/)).toBeNull()
})

test('hides opening hours row when getTodayHours returns null', () => {
  const { getTodayHours } = require('@/lib/utils/hours')
  ;(getTodayHours as jest.Mock).mockReturnValueOnce(null)
  render(<ItineraryCard place={{ ...BASE_PLACE, openingHours: null }} index={0} />)
  expect(screen.queryByText(/今日/)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/itinerary-card-info.test.tsx --no-coverage
```

Expected: FAIL — `@/lib/utils/hours` mock resolves but card doesn't render the new elements yet.

- [ ] **Step 3: Update `components/ItineraryCard.tsx`**

```tsx
'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import { getTodayHours } from '@/lib/utils/hours'
import type { ScheduledPlace } from '@/lib/types'

interface Props {
  place: ScheduledPlace
  index: number
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryCard({ place, index, draggable, onTimeChange }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const todayHours = getTodayHours(place.openingHours)
  const descriptionText = place.description || place.aiDescription

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-xl p-4 ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-1 select-none"
          >&#x2807;</span>
        )}
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{place.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              place.type === 'attraction' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {place.type === 'attraction' ? '景點' : '餐廳'}
            </span>
            {place.outsideHours && (
              <span className="text-xs text-orange-600 font-medium">&#x26A0; 請確認營業時間</span>
            )}
          </div>
          <div className="flex gap-4 mt-1 flex-wrap">
            {onTimeChange ? (
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
        </div>
      </div>
      {place.travelMinToNext !== null && place.travelMinToNext > 0 && (
        <p className="text-xs text-gray-400 mt-3 pl-10">&#x2192; 前往下一站約 {place.travelMinToNext} 分鐘</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/itinerary-card-info.test.tsx --no-coverage
```

Expected: 6 tests pass, 0 failures.

- [ ] **Step 5: Run full suite to check nothing regressed**

```bash
npx jest --no-coverage 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/ItineraryCard.tsx __tests__/itinerary-card-info.test.tsx
git commit -m "feat: show opening hours and description in itinerary card, remove ticket price"
```

---

### Task 3: Per-day Google Maps Embed + layout cleanup

**Files:**
- Modify: `components/ItineraryDay.tsx`
- Modify: `app/itinerary/ItineraryClient.tsx`
- Delete: `components/MapView.tsx`
- Modify: `app/actions/directions.ts` (remove `getDirectionsPolyline`)
- Create: `__tests__/itinerary-day-embed.test.tsx`

**Interfaces:**
- Consumes:
  - `buildDayEmbedUrl(places: ScheduledPlace[], mode: TransportMode): string` from `@/lib/utils/mapUrl`
  - `DayItinerary` (unchanged shape)
  - `TransportMode` from `@/lib/types`
- `ItineraryDay` Props change: add `mode: TransportMode` (required)

---

- [ ] **Step 1: Write the failing test**

Create `__tests__/itinerary-day-embed.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

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
  render(<ItineraryDay day={DAY_TWO_PLACES} mode="driving" />)
  const iframe = screen.getByTitle('第 1 天路線地圖')
  expect(iframe).toBeInTheDocument()
  expect(iframe).toHaveAttribute('src', 'https://maps.google.com/embed/test')
})

test('does not render iframe when only 1 place', () => {
  const onePlace = { ...DAY_TWO_PLACES, places: [makePlace('景點A')] }
  render(<ItineraryDay day={onePlace} mode="driving" />)
  expect(screen.queryByTitle('第 1 天路線地圖')).toBeNull()
})

test('passes mode to buildDayEmbedUrl', () => {
  const { buildDayEmbedUrl } = require('@/lib/utils/mapUrl')
  render(<ItineraryDay day={DAY_TWO_PLACES} mode="transit" />)
  expect(buildDayEmbedUrl).toHaveBeenCalledWith(DAY_TWO_PLACES.places, 'transit')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/itinerary-day-embed.test.tsx --no-coverage
```

Expected: FAIL — `ItineraryDay` doesn't accept `mode` prop yet and has no iframe.

- [ ] **Step 3: Update `components/ItineraryDay.tsx`**

```tsx
import { ItineraryCard } from './ItineraryCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import type { DayItinerary, TransportMode } from '@/lib/types'

interface Props {
  day: DayItinerary
  mode: TransportMode
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryDay({ day, mode, draggable, onTimeChange }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="space-y-3">
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
        <div className="mt-4 rounded-xl overflow-hidden border border-gray-200">
          <iframe
            src={embedUrl}
            width="100%"
            height="400"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            title={`第 ${day.day} 天路線地圖`}
          />
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/itinerary-day-embed.test.tsx --no-coverage
```

Expected: 3 tests pass, 0 failures.

- [ ] **Step 5: Update `app/itinerary/ItineraryClient.tsx` — remove MapView, pass `mode`, fix layout**

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
  arrayMove,
} from '@dnd-kit/sortable'
import type { PlanResult, ScheduledPlace } from '@/lib/types'
import { ItineraryDay } from '@/components/ItineraryDay'
import { RecommendPanel } from '@/components/RecommendPanel'

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

  const handleDragEnd = useCallback((event: DragEndEvent, dayIdx: number) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const day = plan.days[dayIdx]
    const oldIdx = day.places.findIndex((p) => p.id === active.id)
    const newIdx = day.places.findIndex((p) => p.id === over.id)
    const newPlaces = arrayMove(day.places, oldIdx, newIdx).map((p) => ({
      ...p,
      travelMinToNext: null,
    }))
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
      <div>
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
                mode={plan.transportMode}
                onTimeChange={(placeId, field, value) =>
                  handleTimeChange(dayIdx, placeId, field, value)
                }
                draggable
              />
            </SortableContext>
          </DndContext>
        ))}
      </div>
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

- [ ] **Step 6: Remove `getDirectionsPolyline` from `app/actions/directions.ts`**

Keep only `buildDistanceMatrix`. The full file after cleanup:

```typescript
'use server'
import type { Place, TransportMode, DistanceMatrix } from '@/lib/types'
import { haversineSeconds } from '@/lib/haversine'

const GOOGLE_MODE: Record<TransportMode, string> = {
  driving: 'driving',
  walking: 'walking',
  transit: 'transit',
}

export async function buildDistanceMatrix(
  places: Place[],
  mode: TransportMode
): Promise<DistanceMatrix> {
  if (places.length === 0) return { indices: [], matrix: [] }

  const n = places.length
  const indices = places.map((p) => p.placeId)

  const haversineMatrix = () =>
    places.map((a) => places.map((b) => haversineSeconds(a, b)))

  if (n > 25) {
    return { indices, matrix: haversineMatrix() }
  }

  const origins = places.map((p) => `${p.lat},${p.lng}`).join('|')
  const destinations = origins
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(origins)}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    `&mode=${GOOGLE_MODE[mode]}` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`

  try {
    const res = await fetch(url)
    if (!res.ok) return { indices, matrix: haversineMatrix() }
    const data = await res.json()
    if (data.status !== 'OK') return { indices, matrix: haversineMatrix() }

    interface DMatrixElement { status: string; duration: { value: number } }
    interface DMatrixRow { elements: DMatrixElement[] }
    const matrix = data.rows.map((row: DMatrixRow, i: number) =>
      row.elements.map((el: DMatrixElement, j: number) =>
        el.status === 'OK' ? el.duration.value : haversineSeconds(places[i], places[j])
      )
    )
    return { indices, matrix }
  } catch {
    return { indices, matrix: haversineMatrix() }
  }
}
```

- [ ] **Step 7: Delete `components/MapView.tsx`**

```bash
rm components/MapView.tsx
```

- [ ] **Step 8: Run full test suite**

```bash
npx jest --no-coverage 2>&1 | tail -6
```

Expected: all tests pass (no references to `MapView` in tests; TypeScript errors from deleted file are caught at compile time, not test time).

- [ ] **Step 9: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors. If any remain, they reference `MapView` or `ticketPrice` — fix the specific file.

- [ ] **Step 10: Commit**

```bash
git add components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx \
  app/actions/directions.ts __tests__/itinerary-day-embed.test.tsx
git rm components/MapView.tsx
git commit -m "feat: add per-day Google Maps embed, remove straight-line MapView"
```
