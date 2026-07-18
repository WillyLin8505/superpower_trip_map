# Collection Tab (Part B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Surface the imported `saved_places` as a 4th SidePanel tab that works like the recommendation tab — ranks the collection by the day's center, buckets into 甜點/景點/餐廳, and reuses `RecommendationCard` with identical add / 移到備用 / 刪除 actions.

**Architecture:** New pure selection engine over `saved_places` (reusing `resolveDayCenter` + `bucketByCategory` + `splitShownReserve` + `dedupeAndExclude`) → a self-contained `CollectionPanel` (import UI + `DayRecommendations` reuse) → wiring into `SidePanel` (4th tab) + `ItineraryClient`/`ItineraryDay`. Part B of spec `docs/superpowers/specs/2026-07-18-google-takeout-saved-places-import-design.md`. Depends on Part A (`listSavedPlaces`, `importSavedPlaces`).

**Tech Stack:** Next.js 15, TS, Jest + React Testing Library.

## Global Constraints

- Design per `DESIGN.md`; reuse `RecommendationCard` / `DayRecommendations` so the tab is visually identical to 推薦行程.
- Add-time only: paid `getPlaceDetails` runs when a card is added (via the existing `handleAddRecommendation` enrich path), never on tab render.
- 刪除 = dismiss from this suggestion (client-side exclude set), never deletes from `saved_places`.
- Selection is pure and does NOT hit any API (uses stub type+coords already stored).

## Execution order & coordination

Tasks 1-3 are **new files** (safe to build anytime). Task 4 edits **shared files**
(`SidePanel.tsx`, `ItineraryDay.tsx`, `ItineraryClient.tsx`) that a concurrent lane also
edits — run Task 4 only when those files are clean/quiet, commit fast, and re-run the gate.

---

### Task 1: Shared row type (lift out of the 'use server' module)

**Files:**
- Create: `lib/savedPlaces/types.ts`
- Modify: `app/actions/savedPlaces.ts` (import the shared type instead of the local one)

**Interfaces:**
- Produces: `interface SavedPlaceRow { id: string; listName: string; source: SavedPlaceSource; place: Place }`. Consumed by Tasks 2-4 (client-safe, non-'use server').

- [ ] **Step 1: Create the shared type**

```ts
// lib/savedPlaces/types.ts
import type { Place } from '@/lib/types'
import type { SavedPlaceSource } from '@/lib/takeout/parse'

export interface SavedPlaceRow {
  id: string
  listName: string
  source: SavedPlaceSource
  place: Place
}
```

- [ ] **Step 2: Point the action at the shared type**

In `app/actions/savedPlaces.ts`: delete the local `interface SavedPlaceRow {…}` and add
`import type { SavedPlaceRow } from '@/lib/savedPlaces/types'`. `listSavedPlaces`'s return
type is unchanged structurally.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit && npx jest saved-places-actions`
Expected: 0 type errors, actions suite green.
```bash
git add lib/savedPlaces/types.ts app/actions/savedPlaces.ts
git commit -m "refactor(saved-places): shared SavedPlaceRow type (client-safe)"
```

---

### Task 2: Collection selection engine (pure)

**Files:**
- Create: `lib/savedPlaces/select.ts`
- Create: `__tests__/collection-select.test.ts`

**Interfaces:**
- Consumes: `SavedPlaceRow` (Task 1); `bucketByCategory`/`splitShownReserve`/`dedupeAndExclude` from `@/lib/utils/dayRecommend`; `CategoryBuckets`/`DayRecommendation` from `@/lib/types`.
- Produces:
  - `savedRowToRecommendation(row: SavedPlaceRow): DayRecommendation`
  - `selectCollectionBuckets(rows: SavedPlaceRow[], center: { lat: number; lng: number } | null, excludePlaceIds: Set<string>): CategoryBuckets`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/collection-select.test.ts
import { selectCollectionBuckets, savedRowToRecommendation } from '@/lib/savedPlaces/select'
import type { SavedPlaceRow } from '@/lib/savedPlaces/types'
import type { Place } from '@/lib/types'

function place(p: Partial<Place> & { placeId: string; type: Place['type']; lat: number; lng: number }): Place {
  return {
    id: p.placeId, name: p.placeId, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null, localizedName: null, ...p,
  }
}
function row(placeId: string, type: Place['type'], lat: number, lng: number, listName = 'L'): SavedPlaceRow {
  return { id: placeId, listName, source: 'takeout_list', place: place({ placeId, type, lat, lng }) }
}

it('shapes a saved row into a DayRecommendation with collection labels', () => {
  const rec = savedRowToRecommendation(row('a', 'restaurant', 1, 1, '台南美食'))
  expect(rec).toMatchObject({ placeId: 'a', reason: '你的 Google Maps 收藏', sourceLabel: '地圖收藏 / 台南美食' })
})

it('buckets by type, sorts each by distance to center, caps shown at 5', () => {
  const rows: SavedPlaceRow[] = [
    row('far', 'attraction', 10, 10),
    row('near', 'attraction', 0.1, 0.1),
    ...Array.from({ length: 6 }, (_, i) => row(`r${i}`, 'restaurant', i, 0)),
  ]
  const buckets = selectCollectionBuckets(rows, { lat: 0, lng: 0 }, new Set())
  expect(buckets.attraction.shown.map((r) => r.placeId)).toEqual(['near', 'far'])
  expect(buckets.restaurant.shown).toHaveLength(5)
  expect(buckets.restaurant.reserve).toHaveLength(1)
})

it('excludes placeIds already in the day and tolerates a null center', () => {
  const rows = [row('a', 'dessert', 1, 1), row('b', 'dessert', 2, 2)]
  const buckets = selectCollectionBuckets(rows, null, new Set(['a']))
  expect(buckets.dessert.shown.map((r) => r.placeId)).toEqual(['b'])
})
```

- [ ] **Step 2: Run — expect RED** (`npx jest collection-select`).

- [ ] **Step 3: Implement**

```ts
// lib/savedPlaces/select.ts
import type { CategoryBuckets, DayRecommendation } from '@/lib/types'
import type { SavedPlaceRow } from './types'
import { bucketByCategory, splitShownReserve, dedupeAndExclude } from '@/lib/utils/dayRecommend'

const SHOWN_LIMIT = 5

function distSq(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = a.lat - b.lat, dy = a.lng - b.lng
  return dx * dx + dy * dy
}

export function savedRowToRecommendation(row: SavedPlaceRow): DayRecommendation {
  return { ...row.place, reason: '你的 Google Maps 收藏', sourceLabel: `地圖收藏 / ${row.listName}` }
}

export function selectCollectionBuckets(
  rows: SavedPlaceRow[],
  center: { lat: number; lng: number } | null,
  excludePlaceIds: Set<string>,
): CategoryBuckets {
  const recs = dedupeAndExclude(rows.map(savedRowToRecommendation), excludePlaceIds)
  const ordered = center ? [...recs].sort((a, b) => distSq(a, center) - distSq(b, center)) : recs
  const byCat = bucketByCategory(ordered)
  return {
    dessert: splitShownReserve(byCat.dessert, SHOWN_LIMIT),
    attraction: splitShownReserve(byCat.attraction, SHOWN_LIMIT),
    restaurant: splitShownReserve(byCat.restaurant, SHOWN_LIMIT),
  }
}
```

- [ ] **Step 4: Run — expect GREEN** (`npx jest collection-select`).

- [ ] **Step 5: Commit**
```bash
git add lib/savedPlaces/select.ts __tests__/collection-select.test.ts
git commit -m "feat(collection): center-ranked category selection over saved places"
```

---

### Task 3: CollectionPanel component (self-contained)

**Files:**
- Create: `components/CollectionPanel.tsx`
- Create: `__tests__/collection-panel.test.tsx`

**Interfaces:**
- Consumes: `DayRecommendations` (rendering), `parseTakeoutFile` (client-side parse), `importSavedPlaces` (action), `CategoryBuckets`/`DayRecommendation`/`Place`.
- Produces: `CollectionPanel` with props `{ dateIso: string; buckets?: CategoryBuckets; onAdd: (rec: DayRecommendation) => void; onArchive: (rec: DayRecommendation) => void; onDelete: (rec: DayRecommendation) => void; onImported: () => void }`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test** (preview→select→import; empty-state; bucket render). Use `File` + `file.text()`; mock `importSavedPlaces`.

```tsx
// __tests__/collection-panel.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CollectionPanel } from '@/components/CollectionPanel'

const importSavedPlaces = jest.fn(async () => ({ added: 1, existing: 0, unresolved: 0 }))
jest.mock('@/app/actions/savedPlaces', () => ({ importSavedPlaces: (...a: unknown[]) => importSavedPlaces(...a) }))

function csvFile() {
  return new File(['Title,Note,URL\n"度小月","",""'], '台南.csv', { type: 'text/csv' })
}

it('shows an empty state with an import entry point when there is no collection', () => {
  render(<CollectionPanel dateIso="2026-07-18" buckets={undefined} onAdd={jest.fn()} onArchive={jest.fn()} onDelete={jest.fn()} onImported={jest.fn()} />)
  expect(screen.getByTestId('collection-import')).toBeInTheDocument()
})

it('parses an uploaded CSV, previews entries, and imports the selected ones', async () => {
  const onImported = jest.fn()
  render(<CollectionPanel dateIso="2026-07-18" buckets={undefined} onAdd={jest.fn()} onArchive={jest.fn()} onDelete={jest.fn()} onImported={onImported} />)
  fireEvent.change(screen.getByTestId('collection-file'), { target: { files: [csvFile()] } })
  expect(await screen.findByText('度小月')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('collection-do-import'))
  await waitFor(() => expect(importSavedPlaces).toHaveBeenCalledWith([
    expect.objectContaining({ listName: '台南', title: '度小月', source: 'takeout_list' }),
  ]))
  await waitFor(() => expect(onImported).toHaveBeenCalled())
})
```

- [ ] **Step 2: Run — expect RED.**

- [ ] **Step 3: Implement** `components/CollectionPanel.tsx`: a file input (`accept=".json,.csv"`) → `await file.text()` → `parseTakeoutFile(name, text)` → preview list with per-entry checkboxes (default all checked) → 匯入 button calls `importSavedPlaces(selected)` then `onImported()`; below the import area, render `<DayRecommendations recommendations={buckets} dateIso={dateIso} onAdd={onAdd} onArchive={onArchive} onDelete={onDelete} />` (no center-picker props → picker hidden). Empty state (`buckets` undefined/all empty) shows the import prompt with `data-testid="collection-import"`.

- [ ] **Step 4: Run — expect GREEN.** Full pure/component gate: `npx jest collection-select collection-panel`.

- [ ] **Step 5: Commit**
```bash
git add components/CollectionPanel.tsx __tests__/collection-panel.test.tsx
git commit -m "feat(collection): CollectionPanel — Takeout import UI + reused recommendation cards"
```

---

### Task 4: Wire the 4th tab (SHARED FILES — run when quiet)

**Files:**
- Modify: `components/SidePanel.tsx` (add `'collection'` to `SidePanelTab`, a `TABS` entry, and a `collection` branch rendering `CollectionPanel`; thread new props)
- Modify: `components/ItineraryDay.tsx` (forward the new collection props)
- Modify: `app/itinerary/ItineraryClient.tsx` (load `collectionRows` via `listSavedPlaces`; per-day `collectionBuckets` via `selectCollectionBuckets(rows, resolveDayCenter(days,dayIdx), excludeSet)`; `handleAddCollectionPlace` = `handleAddRecommendation` + add placeId to the day's exclude set; `handleDismissCollection` adds to exclude set; reload on import)

**Interfaces:**
- Consumes: everything from Tasks 1-3; `resolveDayCenter` from `@/lib/utils/dayRecommend`; `handleAddRecommendation`/`handleArchiveRecommendation` patterns.

- [ ] **Step 1: Guard —** `git status --short` on the three files must be clean and no concurrent edit in flight. If not, STOP and coordinate.
- [ ] **Step 2: SidePanel** — extend `SidePanelTab = 'recommend'|'line'|'reserve'|'collection'`; add `{ key: 'collection', label: '地圖收藏' }` to `TABS`; add props `collectionBuckets?`, `onAddCollectionPlace`, `onArchiveCollection`, `onDismissCollection`, `onCollectionImported`; render `<CollectionPanel …>` under a `tab === 'collection'` branch. Test: `side-panel-tab-collection` renders and switches.
- [ ] **Step 3: ItineraryDay** — forward the four collection props + `collectionBuckets` from ItineraryClient to SidePanel.
- [ ] **Step 4: ItineraryClient** — add `const [collectionRows, setCollectionRows] = useState<SavedPlaceRow[]>([])`; load via `listSavedPlaces()` in an effect (logged-in only); `const [collectionExcluded, setCollectionExcluded] = useState<Record<number, Set<string>>>({})`; compute per-day buckets `selectCollectionBuckets(collectionRows, resolveDayCenter(plan.days, dayIdx), excludedForDay ∪ placeIdsAlreadyInDay)`; `handleAddCollectionPlace(dayIdx, rec)` reuses the `handleAddRecommendation` body then marks `rec.placeId` excluded for that day; `handleDismissCollection(dayIdx, rec)` marks excluded; `onCollectionImported` re-calls `listSavedPlaces()`.
- [ ] **Step 5: Gate** — `npx tsc --noEmit && npx eslint . && npx jest`. Expect green (ignore the known `reserve-archive.regression-1` load flake — confirm it passes in isolation).
- [ ] **Step 6: Commit**
```bash
git add components/SidePanel.tsx components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx
git commit -m "feat(collection): 4th SidePanel tab wired to the saved-places engine"
```

---

## Notes / deferred

- Large-import async job (beyond chunked persistence) remains future work (see Part A).
- Collection-library management (permanently delete a mis-imported place) is future (spec 未來).
- Optional: mirror imports into `user_place_index` to bias recommendations — not in this plan.
