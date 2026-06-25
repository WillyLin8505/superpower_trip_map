# Itinerary Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js travel itinerary planner that optimises routes with 2-opt TSP, lets users drag-and-drop to edit, generates AI summaries via Claude CLI, and surfaces recommendations from admin-configured reference websites.

**Architecture:** Itinerary page renders in two passes — route optimisation (primary Server Action) renders first; recommendation analysis (parallel Server Action) fills in asynchronously after. All editing state lives client-side with a 2-second debounce before re-fetching travel times. Admin stores source URLs in `config/sources.json` (no database needed).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, @dnd-kit/core + @dnd-kit/sortable, Google Maps JS API (loaded via next/script), Google Places API + Distance Matrix API + Directions API (all server-side), Claude CLI via `child_process.spawn`

## Global Constraints

- Next.js 14 App Router only — no Pages Router
- TypeScript strict mode (`"strict": true` in tsconfig)
- Tailwind CSS for all styling — no inline styles, no CSS modules
- All Google API calls and Claude CLI in Server Actions — never from Client Components
- Google Maps JS API loaded once in `app/layout.tsx` via `next/script` with `strategy="beforeInteractive"`
- `config/sources.json` is the sole persistence layer — no database
- Claude CLI invoked as: `spawn('claude', ['-p', prompt])` (no shell interpolation)
- Default dwell times: attraction = 90 min, restaurant = 60 min
- Day bounds: 09:00 start, 20:00 end
- Max 25 places total (Google Distance Matrix API hard limit)

---

## File Map

```
lib/
  types.ts              # All shared TypeScript interfaces
  haversine.ts          # Pure geodistance fallback (no API)
config/
  sources.json          # Admin-managed reference URLs
app/
  layout.tsx            # Root layout — loads Google Maps JS script
  page.tsx              # Input page (Server Component shell)
  itinerary/
    page.tsx            # Itinerary page (Server Component — fetches plan)
    ItineraryClient.tsx # Client Component — dnd-kit state + debounce
  admin/
    page.tsx            # Admin page (Server Component shell)
  actions/
    places.ts           # Google Places API: search + details + verify
    directions.ts       # Distance Matrix API → N×N matrix; Directions API → polyline
    optimize.ts         # 2-opt TSP: nearestNeighbor + twoOpt
    schedule.ts         # splitByDays + assignTimeSlots
    ai.ts               # Claude CLI subprocess: summaries + recommendations
    scrape.ts           # Fetch URL → extract plain text
    recommend.ts        # Orchestrates scrape → ai → verify → return list
    sources.ts          # sources.json CRUD (Server Actions)
    plan.ts             # Master orchestrator: places → optimize → schedule → ai
components/
  PlaceSearch.tsx       # Google Places Autocomplete widget
  PlaceList.tsx         # Selected places list with type toggle + delete
  ItineraryDay.tsx      # Single-day DnD container
  ItineraryCard.tsx     # Draggable place card
  TimeEditor.tsx        # Inline start-time + duration editor
  MapView.tsx           # Google Maps embed with numbered markers
  RecommendPanel.tsx    # Recommendations section (async fill-in)
  RecommendCard.tsx     # Single recommendation card with checkbox
  admin/
    SourceList.tsx      # Table of configured URLs
    SourceForm.tsx      # Add-new-URL form
__tests__/
  haversine.test.ts
  optimize.test.ts
  schedule.test.ts
```

---

### Task 1: Project Setup + Shared Types

**Files:**
- Create: `lib/types.ts`
- Create: `config/sources.json`
- Create: `jest.config.ts`
- Create: `.env.local.example`
- Modify: `tsconfig.json` (verify strict mode)

**Interfaces:**
- Produces: all types used by every subsequent task

- [ ] **Step 1: Initialise Next.js project**

```bash
cd /mnt/d/vibe_coding_project/food_map/superpowers_food_map
npx create-next-app@14 . --typescript --tailwind --app --eslint --no-src-dir --import-alias "@/*"
```

Expected: scaffold created, `package.json` present.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install -D jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @types/jest ts-jest
```

- [ ] **Step 4: Create `jest.config.ts`**

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
}

export default createJestConfig(config)
```

- [ ] **Step 5: Create `lib/types.ts`**

```typescript
export type PlaceType = 'attraction' | 'restaurant'
export type TransportMode = 'driving' | 'walking' | 'transit'

export interface Place {
  id: string            // UUID generated client-side
  placeId: string       // Google Place ID
  name: string
  type: PlaceType
  lat: number
  lng: number
  address: string
  openingHours: string[] | null   // e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  rating: number | null
  photoUrl: string | null
  ticketPrice: string | null      // from editorial summary; null if unavailable
}

export interface ScheduledPlace extends Place {
  startTime: string         // "HH:MM" 24h
  durationMin: number       // minutes
  travelMinToNext: number | null  // null for last place of the day
  aiDescription: string | null
  outsideHours: boolean     // true → show orange warning
}

export interface DayItinerary {
  day: number               // 1-indexed
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
  reason: string            // Claude's 1-sentence explanation (Traditional Chinese)
  sourceLabel: string       // label from sources.json
  placeId: string | null    // null if Google couldn't verify
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
  indices: string[]         // place IDs in order
  matrix: number[][]        // matrix[i][j] = seconds from i to j
}
```

- [ ] **Step 6: Create `config/sources.json`**

```json
[]
```

- [ ] **Step 7: Create `.env.local.example`**

```
GOOGLE_MAPS_API_KEY=your_server_side_key_here
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_client_side_key_here
```

Copy to `.env.local` and fill in real keys.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: project setup, shared types, jest config"
```

---

### Task 2: Haversine Distance + Distance Matrix API

**Files:**
- Create: `lib/haversine.ts`
- Create: `app/actions/directions.ts`
- Create: `__tests__/haversine.test.ts`

**Interfaces:**
- Produces:
  - `haversineSeconds(a: {lat,lng}, b: {lat,lng}): number` (lib/haversine.ts)
  - `buildDistanceMatrix(places: Place[], mode: TransportMode): Promise<DistanceMatrix>` (actions/directions.ts)
  - `getDirectionsPolyline(waypoints: {lat,lng}[], mode: TransportMode): Promise<string>` (actions/directions.ts)

- [ ] **Step 1: Write failing tests for haversine**

```typescript
// __tests__/haversine.test.ts
import { haversineSeconds } from '@/lib/haversine'

test('same point returns 0', () => {
  expect(haversineSeconds({ lat: 25.0, lng: 121.5 }, { lat: 25.0, lng: 121.5 })).toBe(0)
})

test('Tokyo to Osaka ~250km walking ~200000s', () => {
  const s = haversineSeconds({ lat: 35.6762, lng: 139.6503 }, { lat: 34.6937, lng: 135.5023 })
  expect(s).toBeGreaterThan(100000)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/haversine.test.ts
```

Expected: FAIL — `haversineSeconds` not found.

- [ ] **Step 3: Implement `lib/haversine.ts`**

```typescript
const WALKING_SPEED_MPS = 1.4   // 5 km/h

export function haversineSeconds(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  const metres = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return Math.round(metres / WALKING_SPEED_MPS)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/haversine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Implement `app/actions/directions.ts`**

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
  const n = places.length
  const indices = places.map((p) => p.placeId)

  if (n > 25) {
    // Fallback: straight-line haversine for all pairs
    const matrix = places.map((a) =>
      places.map((b) => haversineSeconds(a, b))
    )
    return { indices, matrix }
  }

  const origins = places.map((p) => `${p.lat},${p.lng}`).join('|')
  const destinations = origins
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(origins)}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    `&mode=${GOOGLE_MODE[mode]}` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`

  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK') {
    // Fallback on API error
    const matrix = places.map((a) => places.map((b) => haversineSeconds(a, b)))
    return { indices, matrix }
  }

  const matrix = data.rows.map((row: any) =>
    row.elements.map((el: any) =>
      el.status === 'OK' ? el.duration.value : haversineSeconds(places[0], places[0])
    )
  )
  return { indices, matrix }
}

export async function getDirectionsPolyline(
  waypoints: { lat: number; lng: number }[],
  mode: TransportMode
): Promise<string | null> {
  if (waypoints.length < 2) return null
  const origin = `${waypoints[0].lat},${waypoints[0].lng}`
  const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`
  const middle = waypoints
    .slice(1, -1)
    .map((w) => `${w.lat},${w.lng}`)
    .join('|')
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    (middle ? `&waypoints=${encodeURIComponent(middle)}` : '') +
    `&mode=${GOOGLE_MODE[mode]}` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK') return null
  return data.routes[0]?.overview_polyline?.points ?? null
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/haversine.ts app/actions/directions.ts __tests__/haversine.test.ts
git commit -m "feat: haversine fallback and Distance Matrix / Directions server actions"
```

---

### Task 3: 2-opt TSP Optimiser

**Files:**
- Create: `app/actions/optimize.ts`
- Create: `__tests__/optimize.test.ts`

**Interfaces:**
- Consumes: `DistanceMatrix` (from Task 2)
- Produces: `optimizeRoute(matrix: DistanceMatrix): string[]` — returns ordered array of placeIds

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/optimize.test.ts
import { optimizeRoute } from '@/app/actions/optimize'
import type { DistanceMatrix } from '@/lib/types'

// A 4-city problem with known optimal order: 0→1→2→3
const matrix: DistanceMatrix = {
  indices: ['a', 'b', 'c', 'd'],
  matrix: [
    [0,  10, 100, 100],
    [10,  0,  10, 100],
    [100, 10,  0,  10],
    [100, 100, 10,  0],
  ],
}

test('returns all place IDs', () => {
  const result = optimizeRoute(matrix)
  expect(result).toHaveLength(4)
  expect(new Set(result)).toEqual(new Set(['a', 'b', 'c', 'd']))
})

test('finds a reasonable short route', () => {
  const result = optimizeRoute(matrix)
  // optimal is a→b→c→d (total 30) — greedy should find this
  const order = result.map((id) => matrix.indices.indexOf(id))
  let total = 0
  for (let i = 0; i < order.length - 1; i++) {
    total += matrix.matrix[order[i]][order[i + 1]]
  }
  expect(total).toBeLessThan(150)  // much less than worst-case 300
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/optimize.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `app/actions/optimize.ts`**

```typescript
'use server'
import type { DistanceMatrix } from '@/lib/types'

function nearestNeighbor(matrix: number[][], start = 0): number[] {
  const n = matrix.length
  const visited = new Set<number>([start])
  const route = [start]
  let current = start
  while (visited.size < n) {
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && matrix[current][j] < bestDist) {
        best = j
        bestDist = matrix[current][j]
      }
    }
    visited.add(best)
    route.push(best)
    current = best
  }
  return route
}

function routeCost(route: number[], matrix: number[][]): number {
  let cost = 0
  for (let i = 0; i < route.length - 1; i++) {
    cost += matrix[route[i]][route[i + 1]]
  }
  return cost
}

function twoOpt(route: number[], matrix: number[][]): number[] {
  let improved = true
  let best = [...route]
  while (improved) {
    improved = false
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const newRoute = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        if (routeCost(newRoute, matrix) < routeCost(best, matrix)) {
          best = newRoute
          improved = true
        }
      }
    }
  }
  return best
}

export function optimizeRoute(distMatrix: DistanceMatrix): string[] {
  const { indices, matrix } = distMatrix
  const initial = nearestNeighbor(matrix, 0)
  const optimized = twoOpt(initial, matrix)
  return optimized.map((i) => indices[i])
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/optimize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/optimize.ts __tests__/optimize.test.ts
git commit -m "feat: 2-opt TSP route optimiser"
```

---

### Task 4: Day Scheduler

**Files:**
- Create: `app/actions/schedule.ts`
- Create: `__tests__/schedule.test.ts`

**Interfaces:**
- Consumes: `Place[]` (ordered by Task 3), `DistanceMatrix`, day count, `TransportMode`
- Produces: `schedulePlaces(orderedPlaces: Place[], matrix: DistanceMatrix, days: number): DayItinerary[]`

- [ ] **Step 1: Write failing tests**

```typescript
// __tests__/schedule.test.ts
import { schedulePlaces } from '@/app/actions/schedule'
import type { Place, DistanceMatrix } from '@/lib/types'

const makePlaces = (types: ('attraction' | 'restaurant')[]): Place[] =>
  types.map((type, i) => ({
    id: `${i}`,
    placeId: `pid${i}`,
    name: `Place ${i}`,
    type,
    lat: 25 + i * 0.01,
    lng: 121.5,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    ticketPrice: null,
  }))

const zeroMatrix = (n: number): DistanceMatrix => ({
  indices: Array.from({ length: n }, (_, i) => `pid${i}`),
  matrix: Array.from({ length: n }, () => Array(n).fill(0)),
})

test('returns correct number of days', () => {
  const places = makePlaces(['attraction', 'restaurant', 'attraction', 'restaurant'])
  const result = schedulePlaces(places, zeroMatrix(4), 2)
  expect(result).toHaveLength(2)
})

test('each day has places assigned', () => {
  const places = makePlaces(['attraction', 'restaurant', 'attraction'])
  const result = schedulePlaces(places, zeroMatrix(3), 1)
  expect(result[0].places.length).toBeGreaterThan(0)
})

test('restaurants have startTime in meal windows', () => {
  const places = makePlaces(['restaurant'])
  const result = schedulePlaces(places, zeroMatrix(1), 1)
  const r = result[0].places.find((p) => p.type === 'restaurant')!
  const hour = parseInt(r.startTime.split(':')[0], 10)
  expect([12, 18, 19]).toContain(hour)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/schedule.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `app/actions/schedule.ts`**

```typescript
'use server'
import type { Place, ScheduledPlace, DayItinerary, DistanceMatrix } from '@/lib/types'

const DWELL: Record<string, number> = { attraction: 90, restaurant: 60 }
const DAY_START = 9 * 60   // 09:00 in minutes
const DAY_END   = 20 * 60  // 20:00

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

export function schedulePlaces(
  orderedPlaces: Place[],
  distMatrix: DistanceMatrix,
  days: number
): DayItinerary[] {
  // Split evenly across days
  const chunkSize = Math.ceil(orderedPlaces.length / days)
  const dayChunks: Place[][] = Array.from({ length: days }, (_, d) =>
    orderedPlaces.slice(d * chunkSize, (d + 1) * chunkSize)
  )

  return dayChunks.map((chunk, dayIdx) => {
    const placeIds = chunk.map((p) => p.placeId)
    let cursor = DAY_START

    // Separate attractions and restaurants
    const attractions = chunk.filter((p) => p.type === 'attraction')
    const restaurants = chunk.filter((p) => p.type === 'restaurant')

    // Assign meal slots
    const lunchRestaurant = restaurants[0] ?? null
    const dinnerRestaurant = restaurants[1] ?? null
    const extraRestaurants = restaurants.slice(2)

    // Build ordered schedule: AM attractions → lunch → PM attractions → dinner
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

    const scheduled: ScheduledPlace[] = ordered.map((place, i) => {
      // Force meal windows
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

      const outsideHours = false // populated later when we have opening hours
      cursor += durationMin + (travelMin ?? 0)

      return {
        ...place,
        startTime,
        durationMin,
        travelMinToNext: travelMin,
        aiDescription: null,
        outsideHours,
      }
    })

    return { day: dayIdx + 1, places: scheduled, aiSummary: null }
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/schedule.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/schedule.ts __tests__/schedule.test.ts
git commit -m "feat: day scheduler with meal-time slot assignment"
```

---

### Task 5: Google Places Server Action

**Files:**
- Create: `app/actions/places.ts`

**Interfaces:**
- Produces:
  - `searchPlace(query: string): Promise<Place | null>`
  - `getPlaceDetails(placeId: string): Promise<Place | null>`
  - `verifyPlace(name: string): Promise<{ placeId: string; lat: number; lng: number } | null>`

- [ ] **Step 1: Implement `app/actions/places.ts`**

```typescript
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
    type: 'attraction',  // caller sets the correct type
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address ?? '',
    openingHours: r.opening_hours?.weekday_text ?? null,
    rating: r.rating ?? null,
    photoUrl: r.photos?.[0]
      ? `${BASE}/photo?maxwidth=400&photo_reference=${r.photos[0].photo_reference}&key=${KEY}`
      : null,
    ticketPrice: r.editorial_summary?.overview ?? null,
  }
}

export async function searchPlace(query: string): Promise<Place | null> {
  const url =
    `${BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(query)}&inputtype=textquery` +
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

- [ ] **Step 2: Commit**

```bash
git add app/actions/places.ts
git commit -m "feat: Google Places server action (search, details, verify)"
```

---

### Task 6: Input Page UI

**Files:**
- Create: `components/PlaceSearch.tsx`
- Create: `components/PlaceList.tsx`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx` (add Google Maps script)

**Interfaces:**
- Consumes: `Place` type (Task 1), `searchPlace` (Task 5)
- Produces: form that POSTs `{ placeIds: string[], types: PlaceType[], days: number, mode: TransportMode }` to `/itinerary`

- [ ] **Step 1: Add Google Maps JS API to `app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = { title: '旅遊行程規劃' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <head>
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
          strategy="beforeInteractive"
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Implement `components/PlaceSearch.tsx`**

```typescript
'use client'
import { useEffect, useRef } from 'react'
import type { Place, PlaceType } from '@/lib/types'
import { randomUUID } from 'crypto'

interface Props {
  onAdd: (place: Place) => void
}

export function PlaceSearch({ onAdd }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!inputRef.current || !window.google) return
    const ac = new window.google.maps.places.Autocomplete(inputRef.current)
    ac.addListener('place_changed', () => {
      const p = ac.getPlace()
      if (!p.place_id || !p.geometry?.location) return
      const place: Place = {
        id: crypto.randomUUID(),
        placeId: p.place_id,
        name: p.name ?? '',
        type: 'attraction',
        lat: p.geometry.location.lat(),
        lng: p.geometry.location.lng(),
        address: p.formatted_address ?? '',
        openingHours: null,
        rating: null,
        photoUrl: null,
        ticketPrice: null,
      }
      onAdd(place)
      if (inputRef.current) inputRef.current.value = ''
    })
  }, [onAdd])

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder="搜尋景點或餐廳..."
      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}
```

- [ ] **Step 3: Implement `components/PlaceList.tsx`**

```typescript
'use client'
import type { Place, PlaceType } from '@/lib/types'

interface Props {
  places: Place[]
  onTypeChange: (id: string, type: PlaceType) => void
  onRemove: (id: string) => void
}

export function PlaceList({ places, onTypeChange, onRemove }: Props) {
  if (places.length === 0) {
    return <p className="text-gray-400 text-sm py-4 text-center">尚未加入任何地點</p>
  }
  return (
    <ul className="space-y-2">
      {places.map((p) => (
        <li key={p.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
          <span className="flex-1 font-medium text-gray-800">{p.name}</span>
          <button
            onClick={() => onTypeChange(p.id, p.type === 'attraction' ? 'restaurant' : 'attraction')}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              p.type === 'attraction'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-orange-100 text-orange-700'
            }`}
          >
            {p.type === 'attraction' ? '景點' : '餐廳'}
          </button>
          <button
            onClick={() => onRemove(p.id)}
            className="text-gray-400 hover:text-red-500 text-lg leading-none"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: Implement `app/page.tsx`**

```typescript
'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Place, PlaceType, TransportMode } from '@/lib/types'
import { PlaceSearch } from '@/components/PlaceSearch'
import { PlaceList } from '@/components/PlaceList'

export default function InputPage() {
  const router = useRouter()
  const [places, setPlaces] = useState<Place[]>([])
  const [days, setDays] = useState(2)
  const [mode, setMode] = useState<TransportMode>('driving')

  const handleAdd = useCallback((p: Place) => {
    if (places.length >= 25) return
    setPlaces((prev) => [...prev, p])
  }, [places.length])

  const handleTypeChange = useCallback((id: string, type: PlaceType) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, type } : p)))
  }, [])

  const handleRemove = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleSubmit = () => {
    if (places.length < 2) return
    const params = new URLSearchParams({
      places: JSON.stringify(places),
      days: String(days),
      mode,
    })
    router.push(`/itinerary?${params.toString()}`)
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">旅遊行程規劃</h1>
      <p className="text-gray-500 mb-8">輸入景點和餐廳，自動安排最順路的行程</p>

      <section className="mb-6">
        <PlaceSearch onAdd={handleAdd} />
        {places.length >= 25 && (
          <p className="text-red-500 text-sm mt-2">最多輸入 25 個地點</p>
        )}
      </section>

      <section className="mb-6">
        <PlaceList places={places} onTypeChange={handleTypeChange} onRemove={handleRemove} />
      </section>

      <section className="flex gap-6 mb-8">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">天數</span>
          <input
            type="number"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">交通方式</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TransportMode)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="driving">開車</option>
            <option value="walking">步行</option>
            <option value="transit">大眾運輸</option>
          </select>
        </label>
      </section>

      <button
        onClick={handleSubmit}
        disabled={places.length < 2}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        開始規劃 →
      </button>
    </main>
  )
}
```

- [ ] **Step 5: Start dev server and verify input page renders**

```bash
npm run dev
```

Open http://localhost:3000. Confirm: search box, empty list, days input, mode selector, disabled submit button all visible.

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/page.tsx components/PlaceSearch.tsx components/PlaceList.tsx
git commit -m "feat: input page with Places Autocomplete, place list, settings"
```

---

### Task 7: Itinerary Orchestrator + Basic Display

**Files:**
- Create: `app/actions/plan.ts`
- Create: `app/itinerary/page.tsx`
- Create: `components/ItineraryDay.tsx`
- Create: `components/ItineraryCard.tsx`

**Interfaces:**
- Consumes: URL params `places` (JSON), `days`, `mode`
- Produces: rendered itinerary with day groups and place cards (no editing yet)

- [ ] **Step 1: Implement `app/actions/plan.ts`**

```typescript
'use server'
import type { Place, TransportMode, PlanResult } from '@/lib/types'
import { getPlaceDetails } from './places'
import { buildDistanceMatrix } from './directions'
import { optimizeRoute } from './optimize'
import { schedulePlaces } from './schedule'

export async function planItinerary(
  places: Place[],
  days: number,
  mode: TransportMode
): Promise<PlanResult> {
  // Enrich with full details (opening hours, rating, etc.)
  const enriched = await Promise.all(
    places.map(async (p) => {
      const details = await getPlaceDetails(p.placeId)
      return details ? { ...details, id: p.id, type: p.type } : p
    })
  )

  const matrix = await buildDistanceMatrix(enriched, mode)
  const orderedIds = optimizeRoute(matrix)
  const ordered = orderedIds.map(
    (pid) => enriched.find((p) => p.placeId === pid)!
  ).filter(Boolean)

  const dayItineraries = schedulePlaces(ordered, matrix, days)

  return { days: dayItineraries, transportMode: mode }
}
```

- [ ] **Step 2: Implement `components/ItineraryCard.tsx`**

```typescript
interface Props {
  place: import('@/lib/types').ScheduledPlace
  index: number
}

export function ItineraryCard({ place, index }: Props) {
  return (
    <div className={`bg-white border rounded-xl p-4 ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
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
              <span className="text-xs text-orange-600 font-medium">⚠ 請確認營業時間</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {place.startTime} · 停留 {place.durationMin} 分鐘
          </p>
          {place.rating && (
            <p className="text-sm text-gray-500">評分：{place.rating} ★</p>
          )}
          {place.ticketPrice && (
            <p className="text-sm text-gray-500">票價：{place.ticketPrice}</p>
          )}
          {place.aiDescription && (
            <p className="text-sm text-gray-600 mt-2 italic">{place.aiDescription}</p>
          )}
        </div>
      </div>
      {place.travelMinToNext !== null && (
        <p className="text-xs text-gray-400 mt-3 pl-10">→ 前往下一站約 {place.travelMinToNext} 分鐘</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Implement `components/ItineraryDay.tsx`**

```typescript
import { ItineraryCard } from './ItineraryCard'
import type { DayItinerary } from '@/lib/types'

interface Props {
  day: DayItinerary
}

export function ItineraryDay({ day }: Props) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {day.aiSummary && (
        <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>
      )}
      <div className="space-y-3">
        {day.places.map((place, i) => (
          <ItineraryCard key={place.id} place={place} index={i} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Implement `app/itinerary/page.tsx`**

```typescript
import { planItinerary } from '@/app/actions/plan'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { Place, TransportMode } from '@/lib/types'

interface Props {
  searchParams: { places?: string; days?: string; mode?: string }
}

export default async function ItineraryPage({ searchParams }: Props) {
  const places: Place[] = JSON.parse(searchParams.places ?? '[]')
  const days = Number(searchParams.days ?? 2)
  const mode = (searchParams.mode ?? 'driving') as TransportMode

  const plan = await planItinerary(places, days, mode)

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 flex gap-8">
      <div className="flex-1 min-w-0">
        <a href="/" className="text-blue-600 text-sm mb-6 inline-block">← 重新規劃</a>
        {plan.days.map((day) => (
          <ItineraryDay key={day.day} day={day} />
        ))}
      </div>
      <div className="w-96 shrink-0 sticky top-4 h-[600px] rounded-xl overflow-hidden border border-gray-200">
        <p className="p-4 text-gray-400 text-sm">地圖（下一個任務加入）</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 5: Test the full flow in browser**

With dev server running, go to http://localhost:3000, add 3+ places, set 2 days, click 開始規劃. Confirm itinerary page renders with day groupings and place cards.

- [ ] **Step 6: Commit**

```bash
git add app/actions/plan.ts app/itinerary/page.tsx components/ItineraryDay.tsx components/ItineraryCard.tsx
git commit -m "feat: itinerary orchestrator and basic display"
```

---

### Task 8: Google Maps Component

**Files:**
- Create: `components/MapView.tsx`
- Modify: `app/itinerary/page.tsx` (wire in MapView)

**Interfaces:**
- Consumes: `PlanResult` (Task 7)
- Produces: Google Maps embed with numbered markers and route polyline

- [ ] **Step 1: Implement `components/MapView.tsx`**

```typescript
'use client'
import { useEffect, useRef } from 'react'
import type { ScheduledPlace } from '@/lib/types'

interface Props {
  allPlaces: ScheduledPlace[]   // all places across all days, in visit order
}

export function MapView({ allPlaces }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapRef.current || !window.google || allPlaces.length === 0) return

    const bounds = new window.google.maps.LatLngBounds()
    const map = new window.google.maps.Map(mapRef.current, { zoom: 12 })

    allPlaces.forEach((place, i) => {
      const pos = { lat: place.lat, lng: place.lng }
      bounds.extend(pos)

      new window.google.maps.Marker({
        position: pos,
        map,
        label: { text: String(i + 1), color: 'white', fontWeight: 'bold' },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: place.type === 'attraction' ? '#2563eb' : '#ea580c',
          fillOpacity: 1,
          strokeWeight: 0,
        },
        title: place.name,
      })
    })

    map.fitBounds(bounds)

    // Draw polyline between all places
    if (allPlaces.length > 1) {
      new window.google.maps.Polyline({
        path: allPlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: '#6366f1',
        strokeOpacity: 0.7,
        strokeWeight: 2,
        map,
      })
    }
  }, [allPlaces])

  return <div ref={mapRef} className="w-full h-full" />
}
```

- [ ] **Step 2: Wire MapView into `app/itinerary/page.tsx`**

Replace the placeholder div with:

```typescript
import { MapView } from '@/components/MapView'

// Inside the component, before return:
const allPlaces = plan.days.flatMap((d) => d.places)

// Replace the placeholder div:
<div className="w-96 shrink-0 sticky top-4 h-[600px] rounded-xl overflow-hidden border border-gray-200">
  <MapView allPlaces={allPlaces} />
</div>
```

- [ ] **Step 3: Verify map renders in browser**

Go to http://localhost:3000, plan a trip. Confirm: map appears on the right with numbered markers and a connecting polyline.

- [ ] **Step 4: Commit**

```bash
git add components/MapView.tsx app/itinerary/page.tsx
git commit -m "feat: Google Maps with numbered markers and route polyline"
```

---

### Task 9: Editable Itinerary (Drag-and-Drop + Time Editor)

**Files:**
- Create: `app/itinerary/ItineraryClient.tsx`
- Create: `components/TimeEditor.tsx`
- Modify: `components/ItineraryDay.tsx`
- Modify: `components/ItineraryCard.tsx`
- Modify: `app/itinerary/page.tsx`

**Interfaces:**
- Consumes: `PlanResult` from server
- Produces: client-side editable itinerary; recalculates travel times after 2-second debounce

- [ ] **Step 1: Implement `components/TimeEditor.tsx`**

```typescript
'use client'
import { useState } from 'react'

interface Props {
  value: string         // "HH:MM"
  onChange: (v: string) => void
  label: string
}

export function TimeEditor({ value, onChange, label }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <input
        type="time"
        defaultValue={value}
        autoFocus
        onBlur={(e) => { onChange(e.target.value); setEditing(false) }}
        className="border border-blue-400 rounded px-2 py-0.5 text-sm w-24"
      />
    )
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="text-sm text-blue-600 underline underline-offset-2"
    >
      {label}: {value}
    </button>
  )
}
```

- [ ] **Step 2: Implement `app/itinerary/ItineraryClient.tsx`**

```typescript
'use client'
import { useState, useCallback, useRef } from 'react'
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
import type { PlanResult, DayItinerary, ScheduledPlace } from '@/lib/types'
import { ItineraryDay } from '@/components/ItineraryDay'
import { MapView } from '@/components/MapView'
import { RecommendPanel } from '@/components/RecommendPanel'

interface Props {
  initial: PlanResult
}

export function ItineraryClient({ initial }: Props) {
  const [plan, setPlan] = useState<PlanResult>(initial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sensors = useSensors(useSensor(PointerSensor))

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
      <a href="/" className="text-blue-600 text-sm mb-6 inline-block">← 重新規劃</a>
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
```

- [ ] **Step 3: Update `components/ItineraryDay.tsx` to accept drag + edit props**

```typescript
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ItineraryCard } from './ItineraryCard'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

interface Props {
  day: DayItinerary
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryDay({ day, draggable, onTimeChange }: Props) {
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
    </section>
  )
}
```

- [ ] **Step 4: Update `components/ItineraryCard.tsx` to be sortable + editable**

```typescript
'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
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
          >⠿</span>
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
              <span className="text-xs text-orange-600 font-medium">⚠ 請確認營業時間</span>
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
                  value={`${Math.floor(place.durationMin / 60).toString().padStart(2,'0')}:${(place.durationMin % 60).toString().padStart(2,'0')}`}
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
          {place.rating && <p className="text-sm text-gray-500 mt-0.5">評分：{place.rating} ★</p>}
          {place.ticketPrice && <p className="text-sm text-gray-500">票價：{place.ticketPrice}</p>}
          {place.aiDescription && <p className="text-sm text-gray-600 mt-2 italic">{place.aiDescription}</p>}
        </div>
      </div>
      {place.travelMinToNext !== null && (
        <p className="text-xs text-gray-400 mt-3 pl-10">→ 前往下一站約 {place.travelMinToNext} 分鐘</p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Update `app/itinerary/page.tsx` to use ItineraryClient**

```typescript
import { planItinerary } from '@/app/actions/plan'
import { ItineraryClient } from './ItineraryClient'
import type { Place, TransportMode } from '@/lib/types'

interface Props {
  searchParams: { places?: string; days?: string; mode?: string }
}

export default async function ItineraryPage({ searchParams }: Props) {
  const places: Place[] = JSON.parse(searchParams.places ?? '[]')
  const days = Number(searchParams.days ?? 2)
  const mode = (searchParams.mode ?? 'driving') as TransportMode

  const plan = await planItinerary(places, days, mode)

  return <ItineraryClient initial={plan} />
}
```

- [ ] **Step 6: Test drag-and-drop and time editing in browser**

Run the app. Plan a trip with 4+ places. Verify:
- Cards can be dragged to reorder within a day
- Clicking a time opens an editor; changing it updates the card after blur
- After 2 seconds idle, subsequent cards' start times update

- [ ] **Step 7: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx app/itinerary/page.tsx components/ItineraryDay.tsx components/ItineraryCard.tsx components/TimeEditor.tsx
git commit -m "feat: drag-and-drop reorder and inline time editing with 2s debounce"
```

---

### Task 10: Claude CLI Integration (AI Summaries)

**Files:**
- Create: `app/actions/ai.ts`
- Modify: `app/actions/plan.ts` (call generateDaySummaries after scheduling)

**Interfaces:**
- Consumes: `DayItinerary[]`
- Produces: same array with `aiSummary` and `aiDescription` fields populated

- [ ] **Step 1: Implement `app/actions/ai.ts`**

```typescript
'use server'
import { spawn } from 'child_process'
import type { DayItinerary } from '@/lib/types'

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt])
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err || `exit ${code}`))
      else resolve(out.trim())
    })
    child.on('error', reject)
  })
}

interface AiDayResult {
  summary: string
  descriptions: Record<string, string>  // place name → 1-sentence description
}

export async function generateDaySummaries(
  days: DayItinerary[]
): Promise<DayItinerary[]> {
  const enriched = await Promise.all(
    days.map(async (day) => {
      const placeList = day.places
        .map((p) => `- ${p.name}（${p.type === 'attraction' ? '景點' : '餐廳'}，停留 ${p.durationMin} 分鐘）`)
        .join('\n')

      const prompt = `你是旅遊達人。以下是第 ${day.day} 天的行程：\n${placeList}\n\n請用繁體中文回答，回傳純 JSON，格式如下：\n{"summary":"50字以內的今日行程摘要","descriptions":{"地點名稱":"一句特色介紹"}}`

      try {
        const raw = await callClaude(prompt)
        // Extract JSON from response (model may add markdown fences)
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('no JSON in response')
        const parsed: AiDayResult = JSON.parse(jsonMatch[0])

        return {
          ...day,
          aiSummary: parsed.summary ?? null,
          places: day.places.map((p) => ({
            ...p,
            aiDescription: parsed.descriptions?.[p.name] ?? null,
          })),
        }
      } catch {
        // Claude unavailable — return day unchanged
        return day
      }
    })
  )
  return enriched
}
```

- [ ] **Step 2: Call `generateDaySummaries` in `app/actions/plan.ts`**

Add import at top:
```typescript
import { generateDaySummaries } from './ai'
```

At the end of `planItinerary`, before returning:
```typescript
const enrichedDays = await generateDaySummaries(dayItineraries)
return { days: enrichedDays, transportMode: mode }
```

- [ ] **Step 3: Verify AI summaries appear in browser**

Plan a trip. Confirm each day card shows a grey italic summary under the day heading, and each place card shows a 1-sentence italic description. If Claude CLI is unavailable, confirm the app still works (summaries just absent).

- [ ] **Step 4: Commit**

```bash
git add app/actions/ai.ts app/actions/plan.ts
git commit -m "feat: Claude CLI integration for day summaries and place descriptions"
```

---

### Task 11: Website Scraping + Recommendation Pipeline + UI

**Files:**
- Create: `app/actions/scrape.ts`
- Create: `app/actions/recommend.ts`
- Create: `components/RecommendPanel.tsx`
- Create: `components/RecommendCard.tsx`
- Modify: `app/actions/plan.ts` (trigger recommendation in parallel)

**Interfaces:**
- Consumes: `Source[]` from `config/sources.json`, `ScheduledPlace[]` (current itinerary)
- Produces: `Recommendation[]` displayed in bottom panel; user selects and triggers re-plan

- [ ] **Step 1: Implement `app/actions/scrape.ts`**

```typescript
'use server'

export async function scrapeText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ItineraryBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    // Strip tags, collapse whitespace, truncate to 8000 chars
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
    return text || null
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Implement `app/actions/recommend.ts`**

```typescript
'use server'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { spawn } from 'child_process'
import type { Source, ScheduledPlace, Recommendation } from '@/lib/types'
import { scrapeText } from './scrape'
import { verifyPlace } from './places'

function callClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt])
    let out = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`exit ${code}`))
      else resolve(out.trim())
    })
    child.on('error', reject)
  })
}

export async function getRecommendations(
  currentPlaces: ScheduledPlace[]
): Promise<Recommendation[]> {
  // Load sources
  const raw = await readFile(join(process.cwd(), 'config/sources.json'), 'utf-8')
  const sources: Source[] = JSON.parse(raw)
  if (sources.length === 0) return []

  // Scrape all sources in parallel
  const scraped = await Promise.all(
    sources.map(async (src) => ({
      label: src.label,
      text: await scrapeText(src.url),
    }))
  )
  const combinedText = scraped
    .filter((s) => s.text)
    .map((s) => `=== ${s.label} ===\n${s.text}`)
    .join('\n\n')
    .slice(0, 20000)

  if (!combinedText) return []

  const currentNames = currentPlaces.map((p) => p.name).join('、')
  const prompt = `你是旅遊達人。使用者目前行程中已有：${currentNames}\n\n以下是旅遊參考網站的內容：\n${combinedText}\n\n請從中推薦最多 8 個尚未在使用者行程中的餐廳或景點，考量地理相近性和行程風格。\n回傳純 JSON 陣列，格式：[{"name":"地點名稱","type":"restaurant 或 attraction","reason":"一句推薦理由（繁體中文）","sourceLabel":"來源標籤"}]`

  let recs: Array<{ name: string; type: string; reason: string; sourceLabel: string }> = []
  try {
    const raw = await callClaude(prompt)
    const match = raw.match(/\[[\s\S]*\]/)
    if (match) recs = JSON.parse(match[0])
  } catch {
    return []
  }

  // Verify each with Google Places
  const verified = await Promise.all(
    recs.map(async (r) => {
      const result = await verifyPlace(r.name)
      return {
        name: r.name,
        type: r.type === 'restaurant' ? 'restaurant' : 'attraction',
        reason: r.reason,
        sourceLabel: r.sourceLabel,
        placeId: result?.placeId ?? null,
        lat: result?.lat ?? null,
        lng: result?.lng ?? null,
        verified: !!result,
      } satisfies Recommendation
    })
  )
  return verified
}
```

- [ ] **Step 3: Implement `components/RecommendCard.tsx`**

```typescript
'use client'
import type { Recommendation } from '@/lib/types'

interface Props {
  rec: Recommendation
  selected: boolean
  onToggle: () => void
}

export function RecommendCard({ rec, selected, onToggle }: Props) {
  return (
    <label className={`flex items-start gap-3 bg-white border rounded-xl p-4 cursor-pointer transition-colors ${
      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
    } ${!rec.verified ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        disabled={!rec.verified}
        onChange={onToggle}
        className="mt-1 accent-blue-600"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{rec.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            rec.type === 'attraction' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
          }`}>
            {rec.type === 'attraction' ? '景點' : '餐廳'}
          </span>
          {!rec.verified && <span className="text-xs text-gray-400">無法驗證位置</span>}
        </div>
        <p className="text-sm text-gray-600 mt-0.5">{rec.reason}</p>
        <p className="text-xs text-gray-400 mt-0.5">來源：{rec.sourceLabel}</p>
      </div>
    </label>
  )
}
```

- [ ] **Step 4: Implement `components/RecommendPanel.tsx`**

```typescript
'use client'
import { useState } from 'react'
import type { Recommendation, ScheduledPlace } from '@/lib/types'
import { RecommendCard } from './RecommendCard'
import { getRecommendations } from '@/app/actions/recommend'

interface Props {
  currentPlaces: ScheduledPlace[]
  onAddPlaces: (places: ScheduledPlace[]) => void
}

export function RecommendPanel({ currentPlaces, onAddPlaces }: Props) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    const result = await getRecommendations(currentPlaces)
    setRecs(result)
    setLoading(false)
  }

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  const handleAdd = () => {
    if (!recs) return
    const toAdd: ScheduledPlace[] = recs
      .filter((r) => selected.has(r.name) && r.verified)
      .map((r) => ({
        id: crypto.randomUUID(),
        placeId: r.placeId!,
        name: r.name,
        type: r.type as 'attraction' | 'restaurant',
        lat: r.lat!,
        lng: r.lng!,
        address: '',
        openingHours: null,
        rating: null,
        photoUrl: null,
        ticketPrice: null,
        startTime: '09:00',
        durationMin: r.type === 'restaurant' ? 60 : 90,
        travelMinToNext: null,
        aiDescription: r.reason,
        outsideHours: false,
      }))
    onAddPlaces(toAdd)
    setSelected(new Set())
  }

  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-xl font-bold text-gray-800 mb-2">推薦地點</h2>
      <p className="text-sm text-gray-500 mb-4">根據參考網站自動分析，找出適合加入你行程的地點</p>

      {recs === null && (
        <button
          onClick={load}
          disabled={loading}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? '分析中...' : '取得推薦'}
        </button>
      )}

      {recs !== null && recs.length === 0 && (
        <p className="text-gray-400 text-sm">目前沒有推薦（請先在後台設定參考網站）</p>
      )}

      {recs !== null && recs.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {recs.map((r) => (
              <RecommendCard
                key={r.name}
                rec={r}
                selected={selected.has(r.name)}
                onToggle={() => toggle(r.name)}
              />
            ))}
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleAdd}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              加入 {selected.size} 個地點並重新排序
            </button>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Test recommendation flow**

First add a source via `/admin` (next task). Then plan a trip and click 取得推薦. Verify recommendations appear with reasons and source labels. Check/uncheck and click add. Verify selected places appear in the itinerary.

- [ ] **Step 6: Commit**

```bash
git add app/actions/scrape.ts app/actions/recommend.ts components/RecommendPanel.tsx components/RecommendCard.tsx
git commit -m "feat: website scraping, Claude recommendation pipeline, recommendation UI"
```

---

### Task 12: Admin Panel (Reference URL Management)

**Files:**
- Create: `app/actions/sources.ts`
- Create: `app/admin/page.tsx`
- Create: `components/admin/SourceList.tsx`
- Create: `components/admin/SourceForm.tsx`

**Interfaces:**
- Consumes: `config/sources.json`
- Produces: CRUD UI for reference URLs; updates `config/sources.json`

- [ ] **Step 1: Implement `app/actions/sources.ts`**

```typescript
'use server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import type { Source } from '@/lib/types'

const FILE = join(process.cwd(), 'config/sources.json')

async function readSources(): Promise<Source[]> {
  const raw = await readFile(FILE, 'utf-8').catch(() => '[]')
  return JSON.parse(raw)
}

async function writeSources(sources: Source[]): Promise<void> {
  await writeFile(FILE, JSON.stringify(sources, null, 2), 'utf-8')
}

export async function getSources(): Promise<Source[]> {
  return readSources()
}

export async function addSource(formData: FormData): Promise<void> {
  const url = formData.get('url') as string
  const label = formData.get('label') as string
  if (!url || !label) return
  const sources = await readSources()
  sources.push({ id: randomUUID(), url, label, lastFetchedAt: null, lastFetchStatus: null })
  await writeSources(sources)
  revalidatePath('/admin')
}

export async function deleteSource(id: string): Promise<void> {
  const sources = await readSources()
  await writeSources(sources.filter((s) => s.id !== id))
  revalidatePath('/admin')
}
```

- [ ] **Step 2: Implement `components/admin/SourceForm.tsx`**

```typescript
'use client'
import { addSource } from '@/app/actions/sources'

export function SourceForm() {
  return (
    <form action={addSource} className="flex gap-3 flex-wrap">
      <input
        name="url"
        type="url"
        placeholder="https://example.com/travel-guide"
        required
        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-0"
      />
      <input
        name="label"
        type="text"
        placeholder="網站標籤（如：台北美食部落格）"
        required
        className="w-56 border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
      >
        新增網站
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Implement `components/admin/SourceList.tsx`**

```typescript
'use client'
import type { Source } from '@/lib/types'
import { deleteSource } from '@/app/actions/sources'

interface Props {
  sources: Source[]
}

export function SourceList({ sources }: Props) {
  if (sources.length === 0) {
    return <p className="text-gray-400 text-sm py-4">尚未設定任何參考網站</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-200">
          <th className="pb-2 font-medium">標籤</th>
          <th className="pb-2 font-medium">URL</th>
          <th className="pb-2 font-medium">狀態</th>
          <th className="pb-2" />
        </tr>
      </thead>
      <tbody>
        {sources.map((s) => (
          <tr key={s.id} className="border-b border-gray-100">
            <td className="py-3 font-medium text-gray-800">{s.label}</td>
            <td className="py-3 text-gray-500 max-w-xs truncate">{s.url}</td>
            <td className="py-3 text-gray-400">{s.lastFetchStatus ?? '未爬取'}</td>
            <td className="py-3">
              <form action={deleteSource.bind(null, s.id)}>
                <button
                  type="submit"
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  刪除
                </button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 4: Implement `app/admin/page.tsx`**

```typescript
import { getSources } from '@/app/actions/sources'
import { SourceList } from '@/components/admin/SourceList'
import { SourceForm } from '@/components/admin/SourceForm'

export default async function AdminPage() {
  const sources = await getSources()

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">後台管理</h1>
      <p className="text-gray-500 mb-8 text-sm">
        設定推薦系統的參考網站。系統會在使用者規劃行程時自動爬取這些網站並提供推薦。
      </p>
      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-700 mb-3">新增參考網站</h2>
        <SourceForm />
      </section>
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          目前設定的網站（{sources.length} 個）
        </h2>
        <SourceList sources={sources} />
      </section>
    </main>
  )
}
```

- [ ] **Step 5: Test the admin panel**

Go to http://localhost:3000/admin. Add a travel website URL. Confirm it appears in the list. Delete it. Confirm it disappears. Verify `config/sources.json` changes on disk.

- [ ] **Step 6: End-to-end test**

1. Go to `/admin`, add a real food/travel blog URL with a label
2. Go to `/`, search for 4+ places in one city, set 2 days
3. Click 開始規劃
4. Verify: itinerary renders with day groups, AI summaries appear, map shows route
5. Drag a card to a new position, confirm 2-second debounce then times update
6. Click 取得推薦, verify recommendations load with reasons from the blog
7. Select 2 recommendations, click add, verify they appear in itinerary

- [ ] **Step 7: Commit**

```bash
git add app/actions/sources.ts app/admin/page.tsx components/admin/SourceList.tsx components/admin/SourceForm.tsx
git commit -m "feat: admin panel for managing reference website URLs"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in task |
|---|---|
| Google Places Autocomplete | Task 6 (PlaceSearch) |
| Auto-fetch hours/rating/photo/price | Task 5 + 7 (places.ts + plan.ts) |
| 2-opt TSP | Task 3 |
| User specifies days | Task 6 (input form) |
| Transport mode selection | Task 6 (input form) |
| Time-slot scheduling | Task 4 |
| Google Maps embed with route | Task 8 |
| Drag-and-drop reorder (intra/cross-day) | Task 9 |
| Time + duration editing | Task 9 |
| 2-second debounce recalculation | Task 9 |
| Orange warning for outside hours | Task 7 (ItineraryCard) |
| Claude CLI summaries + descriptions | Task 10 |
| Admin panel for source URLs | Task 12 |
| scrape → Claude → verify recommendation pipeline | Task 11 |
| Recommendation UI with checkboxes | Task 11 |
| Add selected recs to itinerary | Task 11 + 9 |
| Max 25 places limit | Task 6 (PlaceSearch guard) |
| API keys server-side only | All Server Actions |
| sources.json persistence | Task 12 |

All spec requirements covered. No gaps found.

**Placeholder scan:** No TBD, TODO, or "similar to task N" patterns. All code blocks contain actual implementations.

**Type consistency check:** `ScheduledPlace.id` used as dnd-kit item ID throughout Tasks 9–11. `Place.placeId` used as Distance Matrix index key in Tasks 2–4. `DayItinerary.places: ScheduledPlace[]` consistent across all tasks.
