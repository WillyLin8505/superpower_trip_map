# Recommendation Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a recommendation is added to a day, remove its card and slide one replacement into the slot (leftover website reserve first, then Google on demand) so each category stays at 5.

**Architecture:** `getDayRecommendations` returns each category as `{ shown, reserve }` — `shown` is the up-to-5 displayed list, `reserve` is leftover website picks (free; already enriched). A new `fetchReplacementRecommendation` server action fetches one Google place on demand. `ItineraryClient` runs the backfill on add: promote from reserve synchronously, else fetch from Google. `DayRecommendations` reads `.shown` and shows a placeholder while a slot is backfilling.

**Tech Stack:** Next.js 14 (App Router, server actions), React 18, TypeScript, Tailwind, Jest + Testing Library. Google Places (Nearby Search, Details) via existing `app/actions/places.ts`.

## Global Constraints

- Next.js `14.2.35`; React `18`; TypeScript `5` — do not bump.
- Tests live in `__tests__/` as kebab-case `*.test.ts` / `*.test.tsx`. Run with `npm test -- <path-substring>`.
- Component/DOM tests require `/** @jest-environment jsdom */` on line 1.
- `next build` runs ESLint and strict type-checks and **fails the build on lint errors and on `Set` spreads** (project tsconfig lacks `downlevelIteration`). Use `Array.from(set)` not `[...set]`; give explicit result types, never `any`. The final task MUST run `npm run build`.
- All user-facing copy is Traditional Chinese.
- Recommendation categories are exactly `dessert | attraction | restaurant`, order `dessert, attraction, restaurant` (`REC_CATEGORIES`). `accommodation` is never a recommendation.
- Google server calls use `process.env.GOOGLE_MAPS_API_KEY` server-side only (never client).
- Do NOT commit any native Jest Windows binding.
- Each category shows up to **5** (`REC_LIMIT = 5`). Reserve holds website-only leftovers; Google fills are never placed in reserve.

---

### Task 1: `shown`/`reserve` shape for `getDayRecommendations`

Changes the recommendation types so each category is `{ shown, reserve }`, updates the pure helpers, and reshapes the server action to compute the reserve. This is one atomic unit (the type and its sole producer).

**Files:**
- Modify: `lib/types.ts` (replace `CategoryBuckets`; add `CategoryArrays`, `CategoryList`)
- Modify: `lib/utils/dayRecommend.ts` (retype `bucketByCategory`; replace `capBuckets` with `splitShownReserve`)
- Modify: `app/actions/recommend.ts` (`getDayRecommendations` builds `{ shown, reserve }`)
- Modify: `__tests__/day-recommend.test.ts` (swap `capBuckets` test for `splitShownReserve`)
- Modify: `__tests__/day-recommendations-action.test.ts` (assert on `.shown`/`.reserve`; add reserve case)

**Interfaces:**
- Consumes: `DayRecommendation`, `DayItinerary` (`@/lib/types`); `centroidOf`, `dedupeAndExclude`, `assignToDays`, `bucketByCategory`, `REC_CATEGORIES` (`@/lib/utils/dayRecommend`); `searchPlace`, `getPlaceDetails`, `nearbySearch` (`./places`); `validateType`, `callClaude`, `scrapeText`.
- Produces:
  - `@/lib/types`: `CategoryArrays { dessert: DayRecommendation[]; attraction: DayRecommendation[]; restaurant: DayRecommendation[] }`; `CategoryList { shown: DayRecommendation[]; reserve: DayRecommendation[] }`; `CategoryBuckets { dessert: CategoryList; attraction: CategoryList; restaurant: CategoryList }`; `RecommendationsByDay = CategoryBuckets[]`.
  - `@/lib/utils/dayRecommend`: `bucketByCategory(recs): CategoryArrays` (runtime unchanged); `splitShownReserve(arr: DayRecommendation[], limit: number): CategoryList`.
  - `getDayRecommendations(days): Promise<RecommendationsByDay>` — each category `{ shown ≤5, reserve = website leftovers }`.

- [ ] **Step 1: Update the types**

In `lib/types.ts`, replace the existing `CategoryBuckets` interface and `RecommendationsByDay` type with:

```ts
export interface CategoryArrays {
  dessert: DayRecommendation[]
  attraction: DayRecommendation[]
  restaurant: DayRecommendation[]
}

export interface CategoryList {
  shown: DayRecommendation[]      // up to 5 — displayed
  reserve: DayRecommendation[]    // leftover website picks, already enriched (may be empty)
}

export interface CategoryBuckets {
  dessert: CategoryList
  attraction: CategoryList
  restaurant: CategoryList
}

export type RecommendationsByDay = CategoryBuckets[]  // index 0 = day 1
```

(Leave `DayRecommendation` unchanged.)

- [ ] **Step 2: Write the failing helper test**

In `__tests__/day-recommend.test.ts`, remove the existing `capBuckets` test(s) and its import of `capBuckets`. Add `splitShownReserve` to the import from `@/lib/utils/dayRecommend`, and add:

```ts
test('splitShownReserve puts the first `limit` in shown and the rest in reserve', () => {
  const items = Array.from({ length: 7 }, (_, i) => rec(`d${i}`, 'dessert'))
  const { shown, reserve } = splitShownReserve(items, 5)
  expect(shown.map((r) => r.placeId)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4'])
  expect(reserve.map((r) => r.placeId)).toEqual(['d5', 'd6'])
})

test('splitShownReserve reserve is empty when items <= limit', () => {
  const items = [rec('a', 'dessert'), rec('b', 'dessert')]
  const { shown, reserve } = splitShownReserve(items, 5)
  expect(shown).toHaveLength(2)
  expect(reserve).toEqual([])
})
```

(The existing `bucketByCategory` test stays — its runtime output is unchanged.)

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- day-recommend.test`
Expected: FAIL — `splitShownReserve` is not exported.

- [ ] **Step 4: Update the helpers**

In `lib/utils/dayRecommend.ts`:
- Change the import to `import type { CategoryArrays, CategoryList, DayItinerary, DayRecommendation } from '@/lib/types'`.
- Change `bucketByCategory`'s return type annotation from `CategoryBuckets` to `CategoryArrays` (body unchanged):

```ts
export function bucketByCategory(recs: DayRecommendation[]): CategoryArrays {
  const buckets: CategoryArrays = { dessert: [], attraction: [], restaurant: [] }
  for (const r of recs) {
    if (r.type === 'dessert') buckets.dessert.push(r)
    else if (r.type === 'restaurant') buckets.restaurant.push(r)
    else if (r.type === 'attraction') buckets.attraction.push(r)
    // accommodation intentionally ignored
  }
  return buckets
}
```

- Delete `capBuckets` entirely and add:

```ts
export function splitShownReserve(arr: DayRecommendation[], limit: number): CategoryList {
  return { shown: arr.slice(0, limit), reserve: arr.slice(limit) }
}
```

- [ ] **Step 5: Run to verify the helper test passes**

Run: `npm test -- day-recommend.test`
Expected: PASS.

- [ ] **Step 6: Write the failing action test changes**

In `__tests__/day-recommendations-action.test.ts`, update the two existing tests to read `.shown` and add a reserve case. Replace the assertion bodies as follows.

In the "fills each category to 5" test, replace the `result[0].dessert`/`attraction`/`restaurant` assertions with:

```ts
  expect(result).toHaveLength(1)
  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].attraction.shown).toHaveLength(5)
  expect(result[0].restaurant.shown).toHaveLength(5)
  // existing itinerary place must not be recommended
  expect(result[0].attraction.shown.map((x) => x.placeId)).not.toContain('attraction-0')
  // fill items are labelled as Google and go to shown, never reserve
  expect(result[0].dessert.shown[0].sourceLabel).toBe('Google 推薦')
  expect(result[0].dessert.reserve).toEqual([])
```

In the "uses website extractions first" test, replace the dessert assertions with:

```ts
  const dessert = result[0].dessert.shown
  expect(dessert).toHaveLength(5)
  expect(dessert[0].placeId).toBe('blog-dessert')
  expect(dessert[0].sourceLabel).toBe('部落格')
  expect(dessert[0].type).toBe('dessert')
```

Then add a new test proving the reserve keeps website leftovers (place >5 website desserts):

```ts
it('keeps website extractions beyond 5 in reserve', async () => {
  r.mockResolvedValue(JSON.stringify([{ id: 's1', url: 'http://x', label: '部落格', lastFetchedAt: null, lastFetchStatus: null }]))
  const { scrapeText } = await import('@/app/actions/scrape')
  ;(scrapeText as jest.Mock).mockResolvedValue('a b c d e f g')
  const { callClaude } = await import('@/lib/claude')
  ;(callClaude as jest.Mock).mockResolvedValue(
    JSON.stringify(
      Array.from({ length: 7 }, (_, i) => ({ name: `甜點${i}`, type: 'dessert', reason: 'r', sourceLabel: '部落格' }))
    )
  )
  // each website name resolves to a distinct dessert place
  sp.mockImplementation(async (name: string) => place(`blog-${name}`, 'dessert'))
  ns.mockResolvedValue([])   // no Google needed
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].dessert.reserve).toHaveLength(2)
  // reserve items are website-sourced, not Google
  expect(result[0].dessert.reserve.every((x) => x.sourceLabel === '部落格')).toBe(true)
})
```

Note: this reuses the file's existing `place`, `oneDay`, and the `r`/`sp`/`ns`/`gd` mock aliases. If the existing test typed `sp.mockResolvedValue(...)`, switch that shared mock to `mockImplementation` only inside this test as shown (it is scoped per-test via `beforeEach` clearing).

- [ ] **Step 7: Run to verify the action test fails**

Run: `npm test -- day-recommendations-action`
Expected: FAIL — `result[0].dessert.shown` is undefined (action still returns arrays).

- [ ] **Step 8: Reshape `getDayRecommendations`**

In `app/actions/recommend.ts`:
- Update the dayRecommend import to: `import { REC_CATEGORIES, centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, splitShownReserve } from '@/lib/utils/dayRecommend'` (drop `capBuckets`).
- Keep `import type { DayItinerary, DayRecommendation, RecommendationsByDay, CategoryBuckets } from '@/lib/types'`.
- Replace the entire per-day loop (from `const result: RecommendationsByDay = []` to `return result`) with:

```ts
  const result: RecommendationsByDay = []
  for (let i = 0; i < days.length; i++) {
    const websiteBuckets = bucketByCategory(perDay[i])   // CategoryArrays (website-only)
    const dayResult: CategoryBuckets = {
      dessert: splitShownReserve(websiteBuckets.dessert, REC_LIMIT),
      attraction: splitShownReserve(websiteBuckets.attraction, REC_LIMIT),
      restaurant: splitShownReserve(websiteBuckets.restaurant, REC_LIMIT),
    }
    const centroid = centroidOf(days[i].places) ?? centroidOf(days.flatMap((d) => d.places))

    if (centroid) {
      try {
        for (const cat of REC_CATEGORIES) {
          if (dayResult[cat].shown.length >= REC_LIMIT) continue
          const have = new Set<string>([
            ...Array.from(existingIds),
            ...Array.from(recommendedIds),
            ...REC_CATEGORIES.flatMap((c) => [
              ...dayResult[c].shown.map((x) => x.placeId),
              ...dayResult[c].reserve.map((x) => x.placeId),
            ]),
          ])
          const candidates = await nearbySearch(centroid.lat, centroid.lng, cat)
          for (const c of candidates) {
            if (dayResult[cat].shown.length >= REC_LIMIT) break
            if (have.has(c.placeId)) continue
            const detailed = await getPlaceDetails(c.placeId)
            const filled = detailed ? { ...detailed, type: cat } : c
            dayResult[cat].shown.push({ ...filled, reason: 'Google 高評分推薦', sourceLabel: 'Google 推薦' })
            have.add(c.placeId)
            recommendedIds.add(c.placeId)
          }
        }
      } catch {
        // best-effort fill: leave this day's buckets as-is and continue
      }
    }

    result.push(dayResult)
  }

  return result
```

(The `recommendedIds` set is still seeded from `cleaned` above the loop, so it already contains every website placeId including reserve items — cross-day dedup is preserved.)

- [ ] **Step 9: Run both test files + the full suite**

Run: `npm test -- day-recommend.test day-recommendations-action`
Expected: PASS.
Run: `npm test`
Expected: the component/client recommendation tests now FAIL to compile against the new shape — that is expected and fixed in Tasks 3–4. Confirm the two files in this task pass and note which others fail (should be `day-recommendations.test.tsx`, `itinerary-day-recommend.test.tsx`, `itinerary-client-recommend.test.tsx`).

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/utils/dayRecommend.ts app/actions/recommend.ts __tests__/day-recommend.test.ts __tests__/day-recommendations-action.test.ts
git commit -m "feat(recommend): shown/reserve shape for getDayRecommendations"
```

---

### Task 2: `fetchReplacementRecommendation` server action

Fetches one Google Places recommendation for a day+category, excluding given placeIds. Used for on-demand backfill when the reserve is empty.

**Files:**
- Modify: `app/actions/recommend.ts` (append the action)
- Test: `__tests__/fetch-replacement-recommendation.test.ts`

**Interfaces:**
- Consumes: `centroidOf` (`@/lib/utils/dayRecommend`); `nearbySearch`, `getPlaceDetails` (`./places`); `DayItinerary`, `DayRecommendation` (`@/lib/types`).
- Produces: `fetchReplacementRecommendation(day: DayItinerary, category: 'dessert' | 'attraction' | 'restaurant', excludeIds: string[]): Promise<DayRecommendation | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/fetch-replacement-recommendation.test.ts
jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(),
  getPlaceDetails: jest.fn(),
  nearbySearch: jest.fn(),
}))

import { fetchReplacementRecommendation } from '@/app/actions/recommend'
import { getPlaceDetails, nearbySearch } from '@/app/actions/places'
import type { DayItinerary, Place } from '@/lib/types'

const gd = getPlaceDetails as jest.Mock
const ns = nearbySearch as jest.Mock

function place(id: string, type: Place['type']): Place {
  return {
    id, placeId: id, name: id, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: 4.5, photoUrl: null, description: null,
  }
}

function dayWith(placeId: string): DayItinerary {
  return {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      ...place(placeId, 'attraction'),
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }
}

beforeEach(() => jest.clearAllMocks())

it('returns the first non-excluded enriched candidate', async () => {
  ns.mockResolvedValue([place('a', 'dessert'), place('b', 'dessert')])
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))
  const out = await fetchReplacementRecommendation(dayWith('x'), 'dessert', ['a'])
  expect(out?.placeId).toBe('b')
  expect(out?.type).toBe('dessert')
  expect(out?.sourceLabel).toBe('Google 推薦')
})

it('returns null when all candidates are excluded', async () => {
  ns.mockResolvedValue([place('a', 'dessert')])
  gd.mockResolvedValue(place('a', 'attraction'))
  expect(await fetchReplacementRecommendation(dayWith('x'), 'dessert', ['a'])).toBeNull()
})

it('returns null when nearbySearch is empty', async () => {
  ns.mockResolvedValue([])
  expect(await fetchReplacementRecommendation(dayWith('x'), 'restaurant', [])).toBeNull()
})

it('returns null (without calling nearbySearch) when the day has no places', async () => {
  const emptyDay: DayItinerary = { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [] }
  expect(await fetchReplacementRecommendation(emptyDay, 'dessert', [])).toBeNull()
  expect(ns).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- fetch-replacement-recommendation`
Expected: FAIL — `fetchReplacementRecommendation` is not a function.

- [ ] **Step 3: Implement the action**

Append to `app/actions/recommend.ts` (after `getDayRecommendations`):

```ts
export async function fetchReplacementRecommendation(
  day: DayItinerary,
  category: 'dessert' | 'attraction' | 'restaurant',
  excludeIds: string[]
): Promise<DayRecommendation | null> {
  const centroid = centroidOf(day.places)
  if (!centroid) return null
  const exclude = new Set(excludeIds)
  try {
    const candidates = await nearbySearch(centroid.lat, centroid.lng, category)
    for (const c of candidates) {
      if (exclude.has(c.placeId)) continue
      const detailed = await getPlaceDetails(c.placeId)
      const place = detailed ? { ...detailed, type: category } : c
      return { ...place, reason: 'Google 高評分推薦', sourceLabel: 'Google 推薦' }
    }
  } catch {
    return null
  }
  return null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- fetch-replacement-recommendation`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/actions/recommend.ts __tests__/fetch-replacement-recommendation.test.ts
git commit -m "feat(recommend): fetchReplacementRecommendation on-demand backfill action"
```

---

### Task 3: `DayRecommendations` reads `.shown` + backfill placeholder

Updates the panel (and the day components that forward to it) for the new shape, and renders a placeholder in a slot that is mid-backfill.

**Files:**
- Modify: `components/DayRecommendations.tsx`
- Modify: `components/ItineraryDay.tsx` (forward `backfilling`)
- Modify: `components/TimelineDay.tsx` (forward `backfilling`)
- Modify: `__tests__/day-recommendations.test.tsx`
- Modify: `__tests__/itinerary-day-recommend.test.tsx` (new recs shape)

**Interfaces:**
- Consumes: `CategoryBuckets`, `DayRecommendation` (`@/lib/types`); `REC_CATEGORIES` (`@/lib/utils/dayRecommend`); `RecommendationCard`; `TYPE_META`.
- Produces:
  - `DayRecommendations` prop surface: `{ recommendations: CategoryBuckets; dateIso: string; onAdd: (rec: DayRecommendation) => void; backfilling?: Partial<Record<'dessert' | 'attraction' | 'restaurant', boolean>> }`. Renders `recommendations[cat].shown`; a slot mid-backfill shows `data-testid="rec-backfilling"`.
  - `ItineraryDay` / `TimelineDay` gain optional prop `backfilling?: Partial<Record<'dessert' | 'attraction' | 'restaurant', boolean>>`, forwarded to `<DayRecommendations>`.

- [ ] **Step 1: Update the component test**

Replace `__tests__/day-recommendations.test.tsx` with (new shape + placeholder test):

```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayRecommendations } from '@/components/DayRecommendations'
import type { CategoryBuckets, CategoryList, DayRecommendation } from '@/lib/types'

function rec(placeId: string, type: DayRecommendation['type']): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}
const list = (shown: DayRecommendation[], reserve: DayRecommendation[] = []): CategoryList => ({ shown, reserve })

const buckets: CategoryBuckets = {
  dessert: list([rec('d1', 'dessert')]),
  attraction: list([rec('a1', 'attraction')]),
  restaurant: list([rec('r1', 'restaurant')]),
}
const empty: CategoryBuckets = { dessert: list([]), attraction: list([]), restaurant: list([]) }

it('returns null when there are no shown recommendations', () => {
  const { container } = render(<DayRecommendations recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} />)
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
  expect(onAdd).toHaveBeenCalledWith(buckets.dessert.shown[0])
})

it('renders a placeholder for a category that is backfilling', () => {
  render(
    <DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={() => {}} backfilling={{ dessert: true }} />
  )
  expect(screen.getByTestId('rec-backfilling')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- day-recommendations.test`
Expected: FAIL — component reads `recommendations[c]` as an array / no `rec-backfilling`.

- [ ] **Step 3: Update `DayRecommendations.tsx`**

Replace the file body with:

```tsx
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
  backfilling?: Partial<Record<(typeof REC_CATEGORIES)[number], boolean>>
}

export function DayRecommendations({ recommendations, dateIso, onAdd, backfilling }: Props) {
  const [tab, setTab] = useState<(typeof REC_CATEGORIES)[number]>(REC_CATEGORIES[0])

  const total = REC_CATEGORIES.reduce((n, c) => n + recommendations[c].shown.length, 0)
  if (total === 0) return null

  const list = recommendations[tab].shown
  const isBackfilling = !!backfilling?.[tab]

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
            {TYPE_META[c].emoji} {TYPE_META[c].label} {recommendations[c].shown.length}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {list.length === 0 && !isBackfilling ? (
          <p className="text-xs text-gray-400">這個類別暫無推薦</p>
        ) : (
          <>
            {list.map((rec) => (
              <RecommendationCard key={rec.placeId} rec={rec} dateIso={dateIso} onAdd={() => onAdd(rec)} />
            ))}
            {isBackfilling && (
              <div data-testid="rec-backfilling" className="border border-dashed border-gray-200 rounded-xl p-3 text-xs text-gray-400">
                載入中…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify the component test passes**

Run: `npm test -- day-recommendations.test`
Expected: PASS (4 tests).

- [ ] **Step 5: Forward `backfilling` from the day components**

In `components/ItineraryDay.tsx`:
- Add to the `Props` interface (next to `recommendations`/`onAddRecommendation`): `backfilling?: Partial<Record<'dessert' | 'attraction' | 'restaurant', boolean>>`.
- Add `backfilling` to the destructured parameter list.
- In the `<DayRecommendations ... />` JSX, add the prop: `backfilling={backfilling}`.

Apply the identical three changes to `components/TimelineDay.tsx`.

- [ ] **Step 6: Update the day-recommend render test to the new shape**

In `__tests__/itinerary-day-recommend.test.tsx`, change the `recs` fixture so the category is `{ shown, reserve }`:

```tsx
const recs: CategoryBuckets = {
  dessert: { shown: [rec('d1', 'dessert')], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}
```

(Everything else in that test — rendering `day-recommendations`, clicking `rec-add-d1`, asserting `onAddRecommendation` — is unchanged.)

- [ ] **Step 7: Run the affected component/day tests**

Run: `npm test -- day-recommendations.test itinerary-day-recommend`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/DayRecommendations.tsx components/ItineraryDay.tsx components/TimelineDay.tsx __tests__/day-recommendations.test.tsx __tests__/itinerary-day-recommend.test.tsx
git commit -m "feat(recommend): DayRecommendations reads shown + backfill placeholder"
```

---

### Task 4: `ItineraryClient` backfill wiring

On add: remove the card, promote from reserve or fetch one from Google, and drive the placeholder. This is the final task — it also runs `next build` and the full suite.

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx`
- Modify: `__tests__/itinerary-client-recommend.test.tsx`

**Interfaces:**
- Consumes: `fetchReplacementRecommendation` (`@/app/actions/recommend`); `RecommendationsByDay`, `DayRecommendation`, `CategoryBuckets` (`@/lib/types`); existing `getDayRecommendations`, `DWELL`, `scheduleRecalc`, `planRef`.
- Produces: an `ItineraryClient` whose arrow-add keeps each category at 5 by reserve-promotion or Google backfill, passing `backfilling` to each `<ItineraryDay>`.

- [ ] **Step 1: Update the client test**

Replace the body of the single test in `__tests__/itinerary-client-recommend.test.tsx` and add two more. First, update the top mock to include the new action and change the `recs` fixture to the `{ shown, reserve }` shape:

- Change the recommend mock (top of file) to:

```tsx
jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn(),
  fetchReplacementRecommendation: jest.fn(),
}))
```

- Update the imports and fixture:

```tsx
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { getDayRecommendations, fetchReplacementRecommendation } from '@/app/actions/recommend'
import type { PlanResult, RecommendationsByDay, DayRecommendation } from '@/lib/types'

function drec(placeId: string): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type: 'dessert', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, reason: '好吃', sourceLabel: '部落格',
  }
}
```

- Replace the `recs` fixture and tests with:

```tsx
const recsWithReserve: RecommendationsByDay = [{
  dessert: { shown: [drec('d1')], reserve: [drec('d2')] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

const recsNoReserve: RecommendationsByDay = [{
  dessert: { shown: [drec('d1')], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

beforeEach(() => {
  jest.clearAllMocks()
})

it('promotes a reserve item when a card is added', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsWithReserve)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  // d1 removed, reserve d2 slid in; no Google fetch needed
  await waitFor(() => expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument())
  expect(screen.getByTestId('rec-add-d2')).toBeInTheDocument()
  expect(fetchReplacementRecommendation).not.toHaveBeenCalled()
  expect(screen.getByText('d1')).toBeInTheDocument()   // added place shows in itinerary
})

it('fetches a Google replacement when the reserve is empty', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsNoReserve)
  ;(fetchReplacementRecommendation as jest.Mock).mockResolvedValue(drec('g1'))
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchReplacementRecommendation).toHaveBeenCalledTimes(1))
  expect(await screen.findByTestId('rec-add-g1')).toBeInTheDocument()
})

it('leaves the slot empty when Google returns nothing (no crash)', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsNoReserve)
  ;(fetchReplacementRecommendation as jest.Mock).mockResolvedValue(null)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchReplacementRecommendation).toHaveBeenCalledTimes(1))
  expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument()
  expect(screen.getByText('d1')).toBeInTheDocument()   // added place still in itinerary
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- itinerary-client-recommend`
Expected: FAIL — reserve promotion / `fetchReplacementRecommendation` wiring absent.

- [ ] **Step 3: Add imports, refs, and backfill state**

In `app/itinerary/ItineraryClient.tsx`:
- Change the recommend import to: `import { getDayRecommendations, fetchReplacementRecommendation } from '@/app/actions/recommend'`.
- Next to the `recsByDay` state, add a mirror ref and a backfill-key set:

```tsx
  const recsRef = useRef<RecommendationsByDay | null>(null)
  const [backfillKeys, setBackfillKeys] = useState<Set<string>>(new Set())
```

- In the mount effect, keep the ref in sync — change the `.then` to also set the ref:

```tsx
      .then((r) => { if (active) { recsRef.current = r; setRecsByDay(r) } })
      .catch(() => { if (active) { recsRef.current = null; setRecsByDay(null) } })
```

- Add a commit helper (right after the effect):

```tsx
  const commitRecs = useCallback((next: RecommendationsByDay | null) => {
    recsRef.current = next
    setRecsByDay(next)
  }, [])
```

- [ ] **Step 4: Replace `handleAddRecommendation`**

Replace the existing `handleAddRecommendation` (the `useCallback` that builds a `ScheduledPlace` and filters buckets) with:

```tsx
  const handleAddRecommendation = useCallback((dayIdx: number, rec: DayRecommendation) => {
    const cat = rec.type as 'dessert' | 'attraction' | 'restaurant'

    // 1. add the place to the day (existing behavior)
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

    // 2. remove the card; promote a reserve item if available
    const prev = recsRef.current
    if (!prev || !prev[dayIdx]) return
    const bucket = prev[dayIdx][cat]
    const shownAfter = bucket.shown.filter((r) => r.placeId !== rec.placeId)
    let reserve = bucket.reserve
    let needFetch = false
    if (reserve.length > 0) {
      shownAfter.push(reserve[0])
      reserve = reserve.slice(1)
    } else {
      needFetch = true
    }
    const updated: RecommendationsByDay = prev.map((b, i) =>
      i === dayIdx ? { ...b, [cat]: { shown: shownAfter, reserve } } : b
    )
    commitRecs(updated)

    // 3. reserve empty → fetch one from Google on demand
    if (needFetch) {
      const key = `${dayIdx}:${cat}`
      setBackfillKeys((s) => new Set(s).add(key))
      const excludeIds = buildExcludeIds()
      fetchReplacementRecommendation(planRef.current.days[dayIdx], cat, excludeIds)
        .then((repl) => {
          if (!repl) return
          const cur = recsRef.current
          if (!cur || !cur[dayIdx]) return
          if (buildExcludeIds().includes(repl.placeId)) return   // race/dup guard
          const b = cur[dayIdx][cat]
          const next2: RecommendationsByDay = cur.map((x, i) =>
            i === dayIdx ? { ...x, [cat]: { shown: [...b.shown, repl], reserve: b.reserve } } : x
          )
          commitRecs(next2)
        })
        .catch(() => { /* leave slot empty */ })
        .finally(() => setBackfillKeys((s) => { const n = new Set(s); n.delete(key); return n }))
    }
  }, [scheduleRecalc, commitRecs])
```

- Add the `buildExcludeIds` helper just above `handleAddRecommendation`:

```tsx
  const buildExcludeIds = useCallback((): string[] => {
    const ids = new Set<string>()
    planRef.current.days.forEach((d) => d.places.forEach((p) => ids.add(p.placeId)))
    const cur = recsRef.current
    if (cur) {
      cur.forEach((b) =>
        (['dessert', 'attraction', 'restaurant'] as const).forEach((c) => {
          b[c].shown.forEach((r) => ids.add(r.placeId))
          b[c].reserve.forEach((r) => ids.add(r.placeId))
        })
      )
    }
    return Array.from(ids)
  }, [])
```

- [ ] **Step 5: Pass `backfilling` to `ItineraryDay`**

In the `plan.days.map(...)` render, add the `backfilling` prop to `<ItineraryDay ... />` (next to `recommendations`/`onAddRecommendation`):

```tsx
                backfilling={{
                  dessert: backfillKeys.has(`${dayIdx}:dessert`),
                  attraction: backfillKeys.has(`${dayIdx}:attraction`),
                  restaurant: backfillKeys.has(`${dayIdx}:restaurant`),
                }}
```

- [ ] **Step 6: Run the client test**

Run: `npm test -- itinerary-client-recommend`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full suite AND the production build**

Run: `npm test`
Expected: all suites pass.
Run: `npm run build`
Expected: `✓ Compiled successfully`, lint clean, all pages generated. (This is the Vercel command — it catches `any`/`Set`-spread errors that Jest does not.)

- [ ] **Step 8: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx __tests__/itinerary-client-recommend.test.tsx
git commit -m "feat(recommend): backfill on add — promote reserve or fetch from Google"
```

---

## Self-Review

**Spec coverage:**
- `shown`/`reserve` data model → Task 1 (types + `splitShownReserve` + action reshape).
- Reserve = website leftovers, Google fills never reserved → Task 1 (split before fill; fills push to `shown`).
- Lazy one-at-a-time backfill, reserve-first then Google → Task 4 (`handleAddRecommendation`).
- `fetchReplacementRecommendation` (centroid → nearby → first non-excluded → enrich; null on empty/no-centroid) → Task 2.
- Trip-wide no-duplicate for backfills → Task 4 (`buildExcludeIds` + race/dup guard) and Task 1 (`recommendedIds` seeded from all extractions incl. reserve).
- Component reads `.shown` + placeholder → Task 3.
- Exhaustion → empty slot, no crash → Task 4 (test: Google returns null) + Task 2 (returns null).
- Empty day → no Google fetch → Task 2 (centroid null → null).
- Testing (helper, action, component, client integration) → Tasks 1–4.

**Placeholder scan:** No TBD/TODO; every code step shows full code; every run step names the command and expected result.

**Type consistency:** `CategoryArrays` (from `bucketByCategory`) vs `CategoryList` (`{shown, reserve}`) vs `CategoryBuckets` (`{dessert/attraction/restaurant: CategoryList}`) are used consistently across Tasks 1, 3, 4. `splitShownReserve(arr, limit): CategoryList` signature matches its Task 1 use. `fetchReplacementRecommendation(day, category, excludeIds): Promise<DayRecommendation | null>` matches its call in Task 4. `backfilling?: Partial<Record<'dessert'|'attraction'|'restaurant', boolean>>` is identical across `DayRecommendations`, `ItineraryDay`, `TimelineDay`, and the client's passed object.

**Build gate:** Task 4 runs `npm run build` (not just `npm test`), per the Global Constraints — the miss that broke the previous feature's Vercel deploy.
