# Per-Day Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show per-day recommendations under each day's map — three switchable tabs (點心/景點/餐廳), up to 5 cards each, with an arrow button that adds a recommendation into that day's itinerary and removes the card.

**Architecture:** A new server action `getDayRecommendations(days)` scrapes the admin-configured sources, extracts recommendations with Claude, enriches them via Google Place Details, assigns each to its geographically-closest day, and fills any category short of 5 with Google Places nearby high-rated places. Pure assignment/bucketing logic lives in `lib/utils/dayRecommend.ts`. New presentational components `DayRecommendations` (tabs) and `RecommendationCard` (arrow-add) render inside each day's right column under the map. The trip-wide `RecommendPanel` is removed.

**Tech Stack:** Next.js 14 (App Router, server actions), React 18, TypeScript, Tailwind, Jest + Testing Library. Google Places (Details, Nearby Search), Claude via `@/lib/claude`.

## Global Constraints

- Next.js `14.2.35`; React `18`; TypeScript `5` — do not bump.
- Tests live in `__tests__/` as kebab-case `*.test.ts` / `*.test.tsx`. Run with `npm test -- <path-substring>`.
- Component/DOM tests require the `/** @jest-environment jsdom */` pragma on line 1 (see existing `__tests__/recommend-panel.test.tsx`).
- All user-facing copy is Traditional Chinese.
- Server-side Google calls use `process.env.GOOGLE_MAPS_API_KEY` via the `BASE`/`KEY` constants already in `app/actions/places.ts`. Never expose this key client-side.
- Recommendation cards must NOT be draggable (they are not part of `@dnd-kit` sortable contexts).
- Do NOT commit the native Jest Windows binding (breaks Vercel/Linux deploy).
- `PlaceType` is `'attraction' | 'restaurant' | 'dessert' | 'accommodation'`. Recommendations only ever use `dessert | attraction | restaurant`; `accommodation` is excluded.

---

### Task 1: `nearbySearch` Google Places helper

Adds a Google Places **Nearby Search** call used to fill recommendation gaps. Returns lightweight `Place[]` (opening hours / description come later via `getPlaceDetails`).

**Files:**
- Modify: `app/actions/places.ts` (append new export; reuse existing `KEY`, `BASE`, `randomUUID`)
- Test: `__tests__/nearby-search.test.ts`

**Interfaces:**
- Consumes: existing `KEY`, `BASE` constants and `randomUUID` import in `app/actions/places.ts`; `Place`, `PlaceType` from `@/lib/types`.
- Produces: `nearbySearch(lat: number, lng: number, placeType: 'attraction' | 'restaurant' | 'dessert'): Promise<Place[]>` — each `Place` has the given `type`, `openingHours: null`, `description: null`, and `rating`/`photoUrl`/`address` from the nearby result when present.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/nearby-search.test.ts
import { nearbySearch } from '@/app/actions/places'

describe('nearbySearch', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  function mockFetch(payload: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => payload,
    }) as unknown as typeof fetch
  }

  it('maps Google nearby results to Place[] with the requested type', async () => {
    mockFetch({
      status: 'OK',
      results: [
        {
          place_id: 'p1', name: '某甜點店',
          geometry: { location: { lat: 25.01, lng: 121.51 } },
          vicinity: '台北市', rating: 4.6,
          photos: [{ photo_reference: 'ref1' }],
        },
      ],
    })
    const out = await nearbySearch(25.0, 121.5, 'dessert')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      placeId: 'p1', name: '某甜點店', type: 'dessert',
      lat: 25.01, lng: 121.51, rating: 4.6,
      photoUrl: '/api/photo?ref=ref1', openingHours: null, description: null,
    })
  })

  it('returns [] when status is not OK', async () => {
    mockFetch({ status: 'ZERO_RESULTS', results: [] })
    expect(await nearbySearch(25.0, 121.5, 'restaurant')).toEqual([])
  })

  it('sends the mapped Google type for attractions', async () => {
    mockFetch({ status: 'OK', results: [] })
    await nearbySearch(25.0, 121.5, 'attraction')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('nearbysearch/json')
    expect(url).toContain('type=tourist_attraction')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- nearby-search`
Expected: FAIL — `nearbySearch is not a function` (not yet exported).

- [ ] **Step 3: Implement `nearbySearch`**

Append to `app/actions/places.ts` (after `verifyPlace`):

```ts
const NEARBY_QUERY: Record<'attraction' | 'restaurant' | 'dessert', { type?: string; keyword?: string }> = {
  attraction: { type: 'tourist_attraction' },
  restaurant: { type: 'restaurant' },
  dessert: { keyword: '甜點 dessert cafe' },
}

export async function nearbySearch(
  lat: number,
  lng: number,
  placeType: 'attraction' | 'restaurant' | 'dessert'
): Promise<Place[]> {
  const q = NEARBY_QUERY[placeType]
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: '4000',
    key: KEY,
    language: 'zh-TW',
  })
  if (q.type) params.set('type', q.type)
  if (q.keyword) params.set('keyword', q.keyword)

  const url = `${BASE}/nearbysearch/json?${params.toString()}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()
  if (data.status !== 'OK' || !Array.isArray(data.results)) return []

  return data.results.map(
    (r: any): Place => ({
      id: randomUUID(),
      placeId: r.place_id,
      name: r.name,
      type: placeType,
      lat: r.geometry?.location?.lat ?? lat,
      lng: r.geometry?.location?.lng ?? lng,
      address: r.vicinity ?? '',
      openingHours: null,
      rating: r.rating ?? null,
      photoUrl: r.photos?.[0] ? `/api/photo?ref=${r.photos[0].photo_reference}` : null,
      description: null,
    })
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- nearby-search`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/actions/places.ts __tests__/nearby-search.test.ts
git commit -m "feat(places): add nearbySearch helper for recommendation fill"
```

---

### Task 2: Types + pure day-recommendation helpers

Adds the `DayRecommendation` / `CategoryBuckets` / `RecommendationsByDay` types and the pure functions that assign recommendations to days and bucket them by category. No I/O — fully unit-testable.

**Files:**
- Modify: `lib/types.ts` (append types after `Recommendation`)
- Create: `lib/utils/dayRecommend.ts`
- Test: `__tests__/day-recommend.test.ts`

**Interfaces:**
- Consumes: `Place`, `DayItinerary` from `@/lib/types`; `findClosestDay` from `@/lib/utils/geo`.
- Produces (in `@/lib/types`):
  - `DayRecommendation extends Place { reason: string; sourceLabel: string }`
  - `CategoryBuckets { dessert: DayRecommendation[]; attraction: DayRecommendation[]; restaurant: DayRecommendation[] }`
  - `RecommendationsByDay = CategoryBuckets[]` (index 0 = day 1)
- Produces (in `@/lib/utils/dayRecommend`):
  - `REC_CATEGORIES: ReadonlyArray<'dessert' | 'attraction' | 'restaurant'>` (order: dessert, attraction, restaurant)
  - `centroidOf(places: { lat: number; lng: number }[]): { lat: number; lng: number } | null`
  - `dedupeAndExclude(recs: DayRecommendation[], excludePlaceIds: Set<string>): DayRecommendation[]`
  - `assignToDays(recs: DayRecommendation[], days: DayItinerary[]): DayRecommendation[][]`
  - `bucketByCategory(recs: DayRecommendation[]): CategoryBuckets`
  - `capBuckets(buckets: CategoryBuckets, limit: number): CategoryBuckets`

- [ ] **Step 1: Add the types**

Append to `lib/types.ts` (after the `Recommendation` interface, line 52):

```ts
export interface DayRecommendation extends Place {
  reason: string            // Claude's 1-sentence rationale, or generic text for Places fills
  sourceLabel: string       // website label, or 'Google 推薦' for Places fills
}

export interface CategoryBuckets {
  dessert: DayRecommendation[]      // up to 5
  attraction: DayRecommendation[]   // up to 5
  restaurant: DayRecommendation[]   // up to 5
}

export type RecommendationsByDay = CategoryBuckets[]  // index 0 = day 1
```

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/day-recommend.test.ts
import {
  centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, capBuckets,
} from '@/lib/utils/dayRecommend'
import type { DayItinerary, DayRecommendation, PlaceType } from '@/lib/types'

function rec(placeId: string, type: PlaceType, lat = 25, lng = 121): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}

function day(lat: number, lng: number): DayItinerary {
  return {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      id: 'x', placeId: 'x', name: 'x', type: 'attraction', lat, lng, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }
}

test('centroidOf returns null for empty and the mean otherwise', () => {
  expect(centroidOf([])).toBeNull()
  expect(centroidOf([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }])).toEqual({ lat: 1, lng: 2 })
})

test('dedupeAndExclude drops excluded ids and duplicate placeIds', () => {
  const out = dedupeAndExclude(
    [rec('a', 'restaurant'), rec('a', 'restaurant'), rec('b', 'restaurant')],
    new Set(['b'])
  )
  expect(out.map((r) => r.placeId)).toEqual(['a'])
})

test('assignToDays sends each rec to the geographically closest day', () => {
  const days = [day(25.0, 121.5), day(22.6, 120.3)]   // Taipei, Kaohsiung
  const out = assignToDays(
    [rec('taipei', 'attraction', 25.05, 121.55), rec('kao', 'attraction', 22.6, 120.3)],
    days
  )
  expect(out[0].map((r) => r.placeId)).toEqual(['taipei'])
  expect(out[1].map((r) => r.placeId)).toEqual(['kao'])
})

test('bucketByCategory splits by type and ignores accommodation', () => {
  const b = bucketByCategory([
    rec('d', 'dessert'), rec('a', 'attraction'), rec('r', 'restaurant'), rec('h', 'accommodation'),
  ])
  expect(b.dessert.map((r) => r.placeId)).toEqual(['d'])
  expect(b.attraction.map((r) => r.placeId)).toEqual(['a'])
  expect(b.restaurant.map((r) => r.placeId)).toEqual(['r'])
})

test('capBuckets limits each category', () => {
  const many = Array.from({ length: 7 }, (_, i) => rec(`d${i}`, 'dessert'))
  const capped = capBuckets({ dessert: many, attraction: [], restaurant: [] }, 5)
  expect(capped.dessert).toHaveLength(5)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- day-recommend`
Expected: FAIL — cannot find module `@/lib/utils/dayRecommend`.

- [ ] **Step 4: Implement the helpers**

```ts
// lib/utils/dayRecommend.ts
import type { CategoryBuckets, DayItinerary, DayRecommendation } from '@/lib/types'
import { findClosestDay } from './geo'

export const REC_CATEGORIES = ['dessert', 'attraction', 'restaurant'] as const

export function centroidOf(
  places: { lat: number; lng: number }[]
): { lat: number; lng: number } | null {
  if (places.length === 0) return null
  const lat = places.reduce((s, p) => s + p.lat, 0) / places.length
  const lng = places.reduce((s, p) => s + p.lng, 0) / places.length
  return { lat, lng }
}

export function dedupeAndExclude(
  recs: DayRecommendation[],
  excludePlaceIds: Set<string>
): DayRecommendation[] {
  const seen = new Set<string>()
  const out: DayRecommendation[] = []
  for (const r of recs) {
    if (!r.placeId || excludePlaceIds.has(r.placeId) || seen.has(r.placeId)) continue
    seen.add(r.placeId)
    out.push(r)
  }
  return out
}

export function assignToDays(
  recs: DayRecommendation[],
  days: DayItinerary[]
): DayRecommendation[][] {
  const buckets: DayRecommendation[][] = days.map(() => [])
  for (const r of recs) {
    const idx = findClosestDay(days, r)
    buckets[idx].push(r)
  }
  return buckets
}

export function bucketByCategory(recs: DayRecommendation[]): CategoryBuckets {
  const buckets: CategoryBuckets = { dessert: [], attraction: [], restaurant: [] }
  for (const r of recs) {
    if (r.type === 'dessert') buckets.dessert.push(r)
    else if (r.type === 'restaurant') buckets.restaurant.push(r)
    else if (r.type === 'attraction') buckets.attraction.push(r)
    // accommodation intentionally ignored
  }
  return buckets
}

export function capBuckets(buckets: CategoryBuckets, limit: number): CategoryBuckets {
  return {
    dessert: buckets.dessert.slice(0, limit),
    attraction: buckets.attraction.slice(0, limit),
    restaurant: buckets.restaurant.slice(0, limit),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- day-recommend`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/utils/dayRecommend.ts __tests__/day-recommend.test.ts
git commit -m "feat(recommend): per-day recommendation types and assignment helpers"
```

---

### Task 3: `getDayRecommendations` server action

Composes the pipeline: scrape sources → Claude extract (including 點心) → enrich via Place Details → assign to closest day → fill each category to 5 via `nearbySearch` → cap. Returns `RecommendationsByDay`.

**Files:**
- Modify: `app/actions/recommend.ts` (add new action; keep file `'use server'`)
- Test: `__tests__/day-recommendations-action.test.ts`

**Interfaces:**
- Consumes: `scrapeText` (`./scrape`); `searchPlace`, `getPlaceDetails`, `nearbySearch` (`./places`); `callClaude` (`@/lib/claude`); `validateType` (`@/lib/placeType`); helpers from `@/lib/utils/dayRecommend`; `readFile` (`fs/promises`).
- Produces: `getDayRecommendations(days: DayItinerary[]): Promise<RecommendationsByDay>` — length equals `days.length`; each category ≤ 5; excludes placeIds already in the itinerary; fill items carry `sourceLabel: 'Google 推薦'`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/day-recommendations-action.test.ts
jest.mock('fs/promises', () => ({ readFile: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))
jest.mock('@/lib/claude', () => ({ callClaude: jest.fn() }))
jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(),
  getPlaceDetails: jest.fn(),
  nearbySearch: jest.fn(),
}))

import { getDayRecommendations } from '@/app/actions/recommend'
import { readFile } from 'fs/promises'
import { searchPlace, getPlaceDetails, nearbySearch } from '@/app/actions/places'
import type { DayItinerary, Place } from '@/lib/types'

const r = readFile as jest.Mock
const sp = searchPlace as jest.Mock
const gd = getPlaceDetails as jest.Mock
const ns = nearbySearch as jest.Mock

function place(id: string, type: Place['type']): Place {
  return {
    id, placeId: id, name: id, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: 4.5, photoUrl: null, description: null,
  }
}

function oneDay(existingPlaceId: string): DayItinerary {
  return {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      ...place(existingPlaceId, 'attraction'),
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }
}

beforeEach(() => jest.clearAllMocks())

it('fills each category to 5 with nearby results, excluding existing places', async () => {
  r.mockResolvedValue('[]')                       // no sources configured
  // nearby returns 6 candidates per category; one collides with the existing place id
  ns.mockImplementation(async (_lat, _lng, type) =>
    Array.from({ length: 6 }, (_, i) => place(`${type}-${i}`, type))
  )
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  expect(result).toHaveLength(1)
  expect(result[0].dessert).toHaveLength(5)
  expect(result[0].attraction).toHaveLength(5)
  expect(result[0].restaurant).toHaveLength(5)
  // existing itinerary place must not be recommended
  expect(result[0].attraction.map((x) => x.placeId)).not.toContain('attraction-0')
  // fill items are labelled as Google
  expect(result[0].dessert[0].sourceLabel).toBe('Google 推薦')
})

it('uses website extractions first, then fills the remainder', async () => {
  r.mockResolvedValue(JSON.stringify([{ id: 's1', url: 'http://x', label: '部落格', lastFetchedAt: null, lastFetchStatus: null }]))
  ;(await import('@/app/actions/scrape')).scrapeText
  const { scrapeText } = await import('@/app/actions/scrape')
  ;(scrapeText as jest.Mock).mockResolvedValue('某甜點店 很好吃')
  ;(await import('@/lib/claude')).callClaude
  const { callClaude } = await import('@/lib/claude')
  ;(callClaude as jest.Mock).mockResolvedValue(
    '[{"name":"某甜點店","type":"dessert","reason":"招牌必吃","sourceLabel":"部落格"}]'
  )
  sp.mockResolvedValue(place('blog-dessert', 'attraction'))  // searchPlace returns Place; type overridden to dessert
  ns.mockImplementation(async (_lat, _lng, type) =>
    Array.from({ length: 6 }, (_, i) => place(`${type}-${i}`, type))
  )
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  const dessert = result[0].dessert
  expect(dessert).toHaveLength(5)
  // first item is the website extraction, kept ahead of Google fills
  expect(dessert[0].placeId).toBe('blog-dessert')
  expect(dessert[0].sourceLabel).toBe('部落格')
  expect(dessert[0].type).toBe('dessert')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- day-recommendations-action`
Expected: FAIL — `getDayRecommendations is not a function`.

- [ ] **Step 3: Implement the action**

Add to the top imports of `app/actions/recommend.ts`:

```ts
import { searchPlace, getPlaceDetails, nearbySearch } from './places'
import { validateType } from '@/lib/placeType'
import {
  REC_CATEGORIES, centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, capBuckets,
} from '@/lib/utils/dayRecommend'
import type { DayItinerary, DayRecommendation, RecommendationsByDay, CategoryBuckets } from '@/lib/types'
```

Append the new action (keep the existing `getRecommendations` for now; it is removed in Task 7):

```ts
const REC_LIMIT = 5

export async function getDayRecommendations(
  days: DayItinerary[]
): Promise<RecommendationsByDay> {
  const existingIds = new Set(days.flatMap((d) => d.places.map((p) => p.placeId)))

  // --- 1. Website extractions (best-effort) ---
  let extracted: DayRecommendation[] = []
  try {
    const raw = await readFile(join(process.cwd(), 'config/sources.json'), 'utf-8')
    const sources: Source[] = JSON.parse(raw)
    if (sources.length > 0) {
      const scraped = await Promise.all(
        sources.map(async (src) => ({ label: src.label, text: await scrapeText(src.url) }))
      )
      const combinedText = scraped
        .filter((s) => s.text)
        .map((s) => `=== ${s.label} ===\n${s.text}`)
        .join('\n\n')
        .slice(0, 20000)

      if (combinedText) {
        const prompt = `你是旅遊達人。以下是旅遊參考網站的內容：\n${combinedText}\n\n請推薦其中的地點，分為三類：點心(dessert)、景點(attraction)、餐廳(restaurant)。每類最多 8 個。\n回傳純 JSON 陣列，格式：[{"name":"地點名稱","type":"dessert 或 attraction 或 restaurant","reason":"一句推薦理由（繁體中文）","sourceLabel":"來源標籤"}]`
        try {
          const rawResponse = await callClaude(prompt)
          const match = rawResponse.match(/\[[\s\S]*\]/)
          const parsed: Array<{ name: string; type: string; reason: string; sourceLabel: string }> =
            match ? JSON.parse(match[0]) : []
          const enriched = await Promise.all(
            parsed.map(async (p) => {
              const place = await searchPlace(p.name)
              if (!place) return null
              return {
                ...place,
                type: validateType(p.type),
                reason: p.reason,
                sourceLabel: p.sourceLabel,
              } satisfies DayRecommendation
            })
          )
          extracted = enriched.filter((x): x is DayRecommendation => x !== null)
        } catch {
          extracted = []
        }
      }
    }
  } catch {
    extracted = []   // missing/invalid sources.json → Google fill only
  }

  // --- 2. Assign to closest day ---
  const cleaned = dedupeAndExclude(extracted, existingIds)
  const perDay = assignToDays(cleaned, days)

  // --- 3. Per day: bucket, fill each category to REC_LIMIT, cap ---
  const result: RecommendationsByDay = []
  for (let i = 0; i < days.length; i++) {
    const buckets = bucketByCategory(perDay[i])
    const centroid = centroidOf(days[i].places) ?? centroidOf(days.flatMap((d) => d.places))

    if (centroid) {
      for (const cat of REC_CATEGORIES) {
        if (buckets[cat].length >= REC_LIMIT) continue
        const have = new Set<string>([
          ...existingIds,
          ...REC_CATEGORIES.flatMap((c) => buckets[c].map((x) => x.placeId)),
        ])
        const candidates = await nearbySearch(centroid.lat, centroid.lng, cat)
        for (const c of candidates) {
          if (buckets[cat].length >= REC_LIMIT) break
          if (have.has(c.placeId)) continue
          const detailed = await getPlaceDetails(c.placeId)
          const place = detailed ? { ...detailed, type: cat } : c
          buckets[cat].push({ ...place, reason: 'Google 高評分推薦', sourceLabel: 'Google 推薦' })
          have.add(c.placeId)
        }
      }
    }

    result.push(capBuckets(buckets, REC_LIMIT) as CategoryBuckets)
  }

  return result
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- day-recommendations-action`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `npm test`
Expected: PASS (existing `recommend-panel` test still passes — `getRecommendations` untouched).

- [ ] **Step 6: Commit**

```bash
git add app/actions/recommend.ts __tests__/day-recommendations-action.test.ts
git commit -m "feat(recommend): getDayRecommendations action with geo assignment + Places fill"
```

---

### Task 4: `RecommendationCard` component

Presentational card mirroring `ItineraryCard`'s info (type badge, opening hours, rating, description) with a left-pointing arrow add button. Not draggable.

**Files:**
- Create: `components/RecommendationCard.tsx`
- Test: `__tests__/recommendation-card.test.tsx`

**Interfaces:**
- Consumes: `DayRecommendation` from `@/lib/types`; `getHoursForDate` from `@/lib/utils/hours`; `TYPE_META` from `@/lib/placeType`.
- Produces: `RecommendationCard({ rec, dateIso, onAdd }: { rec: DayRecommendation; dateIso: string; onAdd: () => void })`. Renders a button with `data-testid={`rec-add-${rec.placeId}`}` and `aria-label={`加入 ${rec.name}`}`.

- [ ] **Step 1: Write the failing test**

```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecommendationCard } from '@/components/RecommendationCard'
import type { DayRecommendation } from '@/lib/types'

const rec: DayRecommendation = {
  id: 'p1', placeId: 'p1', name: '某景點', type: 'attraction',
  lat: 25, lng: 121, address: '台北',
  openingHours: ['星期一: 09:00 – 18:00', '星期二: 09:00 – 18:00', '星期三: 09:00 – 18:00',
    '星期四: 09:00 – 18:00', '星期五: 09:00 – 18:00', '星期六: 09:00 – 18:00', '星期日: 09:00 – 18:00'],
  rating: 4.7, photoUrl: null, description: '很棒的地方',
  reason: '必訪', sourceLabel: '部落格',
}

it('renders name, type badge, rating, description and source', () => {
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={() => {}} />)
  expect(screen.getByText('某景點')).toBeInTheDocument()
  expect(screen.getByText('景點')).toBeInTheDocument()
  expect(screen.getByText(/4.7/)).toBeInTheDocument()
  expect(screen.getByText('很棒的地方')).toBeInTheDocument()
  expect(screen.getByText(/部落格/)).toBeInTheDocument()
})

it('calls onAdd when the arrow button is clicked', () => {
  const onAdd = jest.fn()
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={onAdd} />)
  fireEvent.click(screen.getByTestId('rec-add-p1'))
  expect(onAdd).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- recommendation-card`
Expected: FAIL — cannot find module `@/components/RecommendationCard`.

- [ ] **Step 3: Implement the component**

```tsx
// components/RecommendationCard.tsx
'use client'
import type { DayRecommendation } from '@/lib/types'
import { getHoursForDate } from '@/lib/utils/hours'
import { TYPE_META } from '@/lib/placeType'

interface Props {
  rec: DayRecommendation
  dateIso: string
  onAdd: () => void
}

export function RecommendationCard({ rec, dateIso, onAdd }: Props) {
  const meta = TYPE_META[rec.type]
  const todayHours = getHoursForDate(rec.openingHours, dateIso)

  return (
    <div className={`border border-gray-200 rounded-xl p-3 ${meta.cardBg}`} data-testid={`rec-${rec.placeId}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onAdd}
          aria-label={`加入 ${rec.name}`}
          data-testid={`rec-add-${rec.placeId}`}
          className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center hover:bg-blue-700"
        >
          &#x2190;
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-gray-900 text-sm">{rec.name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
          </div>
          {todayHours && <p className="text-xs text-gray-500 mt-0.5">營業 {todayHours}</p>}
          {rec.rating && <p className="text-xs text-gray-500 mt-0.5">評分：{rec.rating} &#x2605;</p>}
          {rec.description && <p className="text-xs text-gray-600 mt-1 italic">{rec.description}</p>}
          <p className="text-xs text-gray-600 mt-1">{rec.reason}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">來源：{rec.sourceLabel}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- recommendation-card`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/RecommendationCard.tsx __tests__/recommendation-card.test.tsx
git commit -m "feat(recommend): RecommendationCard with arrow add button"
```

---

### Task 5: `DayRecommendations` component (tabs)

Renders the three category tabs (點心/景點/餐廳) and the active tab's cards. Returns `null` when a day has no recommendations.

**Files:**
- Create: `components/DayRecommendations.tsx`
- Test: `__tests__/day-recommendations.test.tsx`

**Interfaces:**
- Consumes: `CategoryBuckets`, `DayRecommendation` from `@/lib/types`; `RecommendationCard` (Task 4); `REC_CATEGORIES` from `@/lib/utils/dayRecommend`; `TYPE_META` from `@/lib/placeType`.
- Produces: `DayRecommendations({ recommendations, dateIso, onAdd }: { recommendations: CategoryBuckets; dateIso: string; onAdd: (rec: DayRecommendation) => void })`. Tab buttons have `data-testid={`rec-tab-${category}`}`; container has `data-testid="day-recommendations"`. Default active tab is `REC_CATEGORIES[0]` (`dessert`).

- [ ] **Step 1: Write the failing test**

```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayRecommendations } from '@/components/DayRecommendations'
import type { CategoryBuckets, DayRecommendation } from '@/lib/types'

function rec(placeId: string, type: DayRecommendation['type']): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}

const buckets: CategoryBuckets = {
  dessert: [rec('d1', 'dessert')],
  attraction: [rec('a1', 'attraction')],
  restaurant: [rec('r1', 'restaurant')],
}

it('returns null when there are no recommendations', () => {
  const { container } = render(
    <DayRecommendations recommendations={{ dessert: [], attraction: [], restaurant: [] }} dateIso="2026-07-01" onAdd={() => {}} />
  )
  expect(container).toBeEmptyDOMElement()
})

it('shows the default (dessert) tab first, then switches tabs', () => {
  render(<DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={() => {}} />)
  expect(screen.getByTestId('rec-add-d1')).toBeInTheDocument()
  expect(screen.queryByTestId('rec-add-r1')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('rec-tab-restaurant'))
  expect(screen.getByTestId('rec-add-r1')).toBeInTheDocument()
  expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument()
})

it('forwards the clicked recommendation to onAdd', () => {
  const onAdd = jest.fn()
  render(<DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={onAdd} />)
  fireEvent.click(screen.getByTestId('rec-add-d1'))
  expect(onAdd).toHaveBeenCalledWith(buckets.dessert[0])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- day-recommendations.test`
Expected: FAIL — cannot find module `@/components/DayRecommendations`.

- [ ] **Step 3: Implement the component**

```tsx
// components/DayRecommendations.tsx
'use client'
import { useState } from 'react'
import type { CategoryBuckets, DayRecommendation } from '@/lib/types'
import { RecommendationCard } from './RecommendationCard'
import { REC_CATEGORIES } from '@/lib/utils/dayRecommend'
import { TYPE_META } from '@/lib/placeType'

interface Props {
  recommendations: CategoryBuckets
  dateIso: string
  onAdd: (rec: DayRecommendation) => void
}

export function DayRecommendations({ recommendations, dateIso, onAdd }: Props) {
  const [tab, setTab] = useState<(typeof REC_CATEGORIES)[number]>(REC_CATEGORIES[0])

  const total = REC_CATEGORIES.reduce((n, c) => n + recommendations[c].length, 0)
  if (total === 0) return null

  const list = recommendations[tab]

  return (
    <div className="mt-3 border-t border-gray-200 pt-3" data-testid="day-recommendations">
      <p className="text-xs font-semibold text-gray-600 mb-2">推薦給這一天</p>
      <div className="flex gap-1 mb-2">
        {REC_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            data-testid={`rec-tab-${c}`}
            className={`text-xs px-2 py-1 rounded-full border ${
              tab === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            {TYPE_META[c].emoji} {TYPE_META[c].label} {recommendations[c].length}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {list.length === 0 ? (
          <p className="text-xs text-gray-400">這個類別暫無推薦</p>
        ) : (
          list.map((rec) => (
            <RecommendationCard key={rec.placeId} rec={rec} dateIso={dateIso} onAdd={() => onAdd(rec)} />
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- day-recommendations.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/DayRecommendations.tsx __tests__/day-recommendations.test.tsx
git commit -m "feat(recommend): DayRecommendations tabbed panel"
```

---

### Task 6: Render `DayRecommendations` inside `ItineraryDay` and `TimelineDay`

Both day components gain optional recommendation props and render the panel in the right column under the map. The right column now renders when there is a map URL **or** recommendations.

**Files:**
- Modify: `components/ItineraryDay.tsx`
- Modify: `components/TimelineDay.tsx`
- Test: `__tests__/itinerary-day-recommend.test.tsx`

**Interfaces:**
- Consumes: `DayRecommendations` (Task 5); `CategoryBuckets`, `DayRecommendation` from `@/lib/types`.
- Produces: both `ItineraryDay` and `TimelineDay` accept two new optional props:
  - `recommendations?: CategoryBuckets`
  - `onAddRecommendation?: (rec: DayRecommendation) => void`
  When both are provided, they render `<DayRecommendations recommendations dateIso onAdd={onAddRecommendation} />` in the right column.

- [ ] **Step 1: Write the failing test**

```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { CategoryBuckets, DayItinerary, DayRecommendation } from '@/lib/types'

function rec(placeId: string, type: DayRecommendation['type']): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}

const recs: CategoryBuckets = {
  dessert: [rec('d1', 'dessert')], attraction: [], restaurant: [],
}

const day: DayItinerary = {
  day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
  places: [{
    id: 'x', placeId: 'x', name: '景點X', type: 'attraction', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
  }],
}

it('renders DayRecommendations and forwards adds', () => {
  const onAddRecommendation = jest.fn()
  render(
    <DndContext>
      <ItineraryDay
        day={day} dayIdx={0} mode="driving" startDate="2026-07-01"
        recommendations={recs} onAddRecommendation={onAddRecommendation}
      />
    </DndContext>
  )
  expect(screen.getByTestId('day-recommendations')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('rec-add-d1'))
  expect(onAddRecommendation).toHaveBeenCalledWith(recs.dessert[0])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- itinerary-day-recommend`
Expected: FAIL — `recommendations`/`onAddRecommendation` not rendered (no `day-recommendations` testid).

- [ ] **Step 3: Update `ItineraryDay.tsx`**

Add imports near the top:

```tsx
import { DayRecommendations } from './DayRecommendations'
import type { DayItinerary, TransportMode, PlaceType, CategoryBuckets, DayRecommendation } from '@/lib/types'
```

(Replace the existing `import type { DayItinerary, TransportMode, PlaceType } from '@/lib/types'` line with the line above.)

Add the two props to the `Props` interface (after `onChangeWindow`):

```tsx
  recommendations?: CategoryBuckets
  onAddRecommendation?: (rec: DayRecommendation) => void
```

Add them to the destructured parameter list in the function signature:

```tsx
export function ItineraryDay({ day, dayIdx, mode, startDate, isDragging, draggable, isOverflow, onScatter, onDelete, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType, onSetDayStartLock, onSetDayDurationLock, onChangeWindow, recommendations, onAddRecommendation }: Props) {
```

Replace the right-column block (currently the `{embedUrl && ( <div className="w-96 ...">...iframe...</div> )}` at the end of the `<div className="flex gap-6 items-start">`) with:

```tsx
        {(embedUrl || (recommendations && onAddRecommendation)) && (
          <div className="w-96 shrink-0 sticky top-4">
            {embedUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
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
            {recommendations && onAddRecommendation && (
              <DayRecommendations
                recommendations={recommendations}
                dateIso={dayDate(startDate, day.day)}
                onAdd={onAddRecommendation}
              />
            )}
          </div>
        )}
```

- [ ] **Step 4: Update `TimelineDay.tsx` identically**

Add imports near the top:

```tsx
import { DayRecommendations } from './DayRecommendations'
import type { DayItinerary, TransportMode, PlaceType, CategoryBuckets, DayRecommendation } from '@/lib/types'
```

(Replace the existing `import type { DayItinerary, TransportMode, PlaceType } from '@/lib/types'` line.)

Add to `Props` (after `onChangeWindow`):

```tsx
  recommendations?: CategoryBuckets
  onAddRecommendation?: (rec: DayRecommendation) => void
```

Add to the destructured signature:

```tsx
export function TimelineDay({ day, dayIdx, mode, startDate, isDragging, draggable, isOverflow, onScatter, onDelete, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType, onSetDayStartLock, onSetDayDurationLock, onChangeWindow, recommendations, onAddRecommendation }: Props) {
```

Replace the right-column `{embedUrl && ( <div className="w-96 ...">...iframe...</div> )}` block with the same structure as ItineraryDay (note TimelineDay already has `dateIso` in scope, use it):

```tsx
        {(embedUrl || (recommendations && onAddRecommendation)) && (
          <div className="w-96 shrink-0 sticky top-4">
            {embedUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
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
            {recommendations && onAddRecommendation && (
              <DayRecommendations
                recommendations={recommendations}
                dateIso={dateIso}
                onAdd={onAddRecommendation}
              />
            )}
          </div>
        )}
```

- [ ] **Step 5: Run the new test and the existing day tests**

Run: `npm test -- itinerary-day-recommend itinerary-day-embed timeline-day`
Expected: PASS — new test passes; `itinerary-day-embed` and `timeline-day` still pass (right column unchanged when no recommendations and `embedUrl` present).

- [ ] **Step 6: Commit**

```bash
git add components/ItineraryDay.tsx components/TimelineDay.tsx __tests__/itinerary-day-recommend.test.tsx
git commit -m "feat(recommend): render per-day recommendations under each day's map"
```

---

### Task 7: Wire into `ItineraryClient` and remove the trip-wide panel

`ItineraryClient` fetches recommendations once after mount, passes each day its buckets, adds a recommendation to the clicked day, and removes the card. The old `RecommendPanel`/`RecommendCard` and the `getRecommendations` action are removed.

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx`
- Delete: `components/RecommendPanel.tsx`, `components/RecommendCard.tsx`
- Delete: `__tests__/recommend-panel.test.tsx`
- Modify: `app/actions/recommend.ts` (remove `getRecommendations` + now-unused imports; keep `getDayRecommendations`)
- Test: `__tests__/itinerary-client-recommend.test.tsx`

**Interfaces:**
- Consumes: `getDayRecommendations` (Task 3); `RecommendationsByDay`, `DayRecommendation` from `@/lib/types`; `DWELL` from `@/lib/placeType`.
- Produces: an `ItineraryClient` that renders `data-testid="day-recommendations"` for days that have recommendations and adds to the correct day on arrow click.

- [ ] **Step 1: Write the failing test**

```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn(),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { getDayRecommendations } from '@/app/actions/recommend'
import type { PlanResult, RecommendationsByDay } from '@/lib/types'

const plan: PlanResult = {
  transportMode: 'driving', startDate: '2026-07-01',
  days: [{
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      id: 'x', placeId: 'x', name: '景點X', type: 'attraction', lat: 25, lng: 121, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }],
}

const recs: RecommendationsByDay = [{
  dessert: [{
    id: 'd1', placeId: 'd1', name: '推薦甜點', type: 'dessert', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, reason: '好吃', sourceLabel: '部落格',
  }],
  attraction: [], restaurant: [],
}]

beforeEach(() => {
  jest.clearAllMocks()
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recs)
})

it('loads day recommendations on mount and adds to that day on arrow click', async () => {
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  const addBtn = await screen.findByTestId('rec-add-d1')
  fireEvent.click(addBtn)

  // card disappears after add
  await waitFor(() => expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument())
  // added place now shows in the itinerary
  expect(screen.getByText('推薦甜點')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- itinerary-client-recommend`
Expected: FAIL — `getDayRecommendations` never called (not wired) / no `rec-add-d1`.

- [ ] **Step 3: Update `ItineraryClient.tsx` imports**

Replace the `RecommendPanel` import line:

```tsx
import { RecommendPanel } from '@/components/RecommendPanel'
```

with:

```tsx
import { getDayRecommendations } from '@/app/actions/recommend'
```

Update the types import on line 17 to add the new types:

```tsx
import type { PlanResult, ScheduledPlace, Place, PlaceType, RecommendationsByDay, DayRecommendation } from '@/lib/types'
```

- [ ] **Step 4: Add recommendation state, fetch, and handler**

Add state next to the other `useState` hooks (after line 47, `const [targetDays, ...]`):

```tsx
  const [recsByDay, setRecsByDay] = useState<RecommendationsByDay | null>(null)
```

Add a mount-time fetch effect (after the existing cleanup `useEffect`, around line 63):

```tsx
  useEffect(() => {
    let active = true
    getDayRecommendations(planRef.current.days)
      .then((r) => { if (active) setRecsByDay(r) })
      .catch(() => { if (active) setRecsByDay(null) })
    return () => { active = false }
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

Add the add-recommendation handler (near `handleAddPlace`, after line 216):

```tsx
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
```

- [ ] **Step 5: Pass the props to `ItineraryDay` and remove `RecommendPanel`**

In the `<ItineraryDay ... />` JSX (inside the `plan.days.map`), add these two props (e.g. after `onChangeWindow=...`):

```tsx
                recommendations={recsByDay?.[dayIdx]}
                onAddRecommendation={(rec) => handleAddRecommendation(dayIdx, rec)}
```

Delete the entire `<RecommendPanel ... />` block (lines 388-399), including its `onAddPlaces` closure.

- [ ] **Step 6: Run the new test to verify it passes**

Run: `npm test -- itinerary-client-recommend`
Expected: PASS.

- [ ] **Step 7: Remove the obsolete panel, card, action, and test**

```bash
git rm components/RecommendPanel.tsx components/RecommendCard.tsx __tests__/recommend-panel.test.tsx
```

In `app/actions/recommend.ts`, delete the `getRecommendations` function (lines 9-61 of the original file) and remove imports that are now unused (`verifyPlace`, `ScheduledPlace`, `Recommendation`). Keep imports still used by `getDayRecommendations` (`readFile`, `join`, `Source`, `scrapeText`, `callClaude`, `searchPlace`, `getPlaceDetails`, `nearbySearch`, `validateType`, the `dayRecommend` helpers, and the day-recommendation types).

- [ ] **Step 8: Run the full suite and lint**

Run: `npm test`
Expected: PASS — no references to the deleted `getRecommendations`/`RecommendPanel` remain.

Run: `npm run lint`
Expected: no errors (no unused imports in `recommend.ts` or `ItineraryClient.tsx`).

- [ ] **Step 9: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx app/actions/recommend.ts __tests__/itinerary-client-recommend.test.tsx
git commit -m "feat(recommend): wire per-day recommendations into ItineraryClient; remove trip-wide panel"
```

---

## Self-Review

**Spec coverage:**
- Per-day strip under the map → Task 6 (right column) + Task 5 (panel).
- 3 tabs (點心/景點/餐廳), 5 per category → Task 5 (tabs) + Task 3 (`REC_LIMIT = 5`, `capBuckets`).
- Card richness (hours/rating/description/photo) → Task 4 (`RecommendationCard`) + Task 3 enrich via `getPlaceDetails`/`searchPlace`.
- Arrow adds to that day, card disappears → Task 7 (`handleAddRecommendation` + `setRecsByDay` filter).
- Geographic day assignment → Task 2 (`assignToDays` via `findClosestDay`).
- Website-first, Google Places fill → Task 3 (extract first, then `nearbySearch` fill) + Task 1 (`nearbySearch`).
- trip.com = arbitrary URL, admin unchanged → no admin task (intentional; `config/sources.json` untouched).
- Replace trip-wide panel → Task 7 (delete `RecommendPanel`/`RecommendCard`/`getRecommendations`).
- Edge: empty day → trip centroid → Task 3 (`centroidOf(days[i].places) ?? centroidOf(all)`); right column still renders → Task 6 condition.
- Edge: exclude already-in-itinerary / dedupe → Task 2 (`dedupeAndExclude`) + Task 3 (`existingIds`, per-category `have` set).
- Testing (unit + component + mocks) → Tasks 1-7 each ship tests.

**Placeholder scan:** No TBD/TODO; every code step shows full code; every run step shows the command and expected result.

**Type consistency:** `DayRecommendation`/`CategoryBuckets`/`RecommendationsByDay` defined in Task 2 and consumed unchanged in Tasks 3-7. `REC_CATEGORIES` order (`dessert, attraction, restaurant`) is the same in `dayRecommend.ts`, the fill loop (Task 3), and the tabs (Task 5). `nearbySearch(lat, lng, type)` signature matches between Task 1 and its callers in Task 3. `onAddRecommendation`/`recommendations` prop names match across Tasks 6 and 7.

**Out of scope (per spec, intentionally no task):** special trip.com integration, per-day manual refresh, persistence across reloads, AI-based day assignment.
