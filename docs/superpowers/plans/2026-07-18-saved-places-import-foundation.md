# Saved-Places Import Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import a user's Google Takeout saved places into a cross-trip `saved_places` table, resolving each entry to a Google Place ID + type + coordinates at cheap Essentials cost.

**Architecture:** Pure parser (Takeout GeoJSON/CSV → entries) + a type classifier + an Essentials-tier resolver (Find Place free ID → Place Details Essentials for type/coords) + user-scoped Supabase server actions (import/list). No UI in this plan; the collection tab is a separate follow-up plan. This is Part A of the spec `docs/superpowers/specs/2026-07-18-google-takeout-saved-places-import-design.md`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (Postgres + RLS), Jest, Google Places API (legacy Details/Find Place).

## Global Constraints

- Design system per `DESIGN.md` (「溫暖旅誌」warm paper `#FBF7F0` + clay `#C65D3B`); no UI in this plan so no visual surface added.
- Cost: import uses the **Essentials** SKU (`place_details_essentials`), never Pro. Pro (`getPlaceDetails`) is deferred to the follow-up tab plan.
- Migration numbering continues the existing sequence: next file is `0011_`.
- RLS: `saved_places` rows are owner-scoped (`auth.uid() = owner_id`); reads/writes go through the user-scoped server client so RLS applies.
- Tests: Jest, `npm test`. Google/Supabase are mocked in unit tests (no live calls).

---

### Task 1: `saved_places` migration

**Files:**
- Create: `supabase/migrations/0011_saved_places.sql`

**Interfaces:**
- Produces: table `public.saved_places(id, owner_id, list_name, source, place_id, place jsonb, note, created_at, updated_at)` with unique `(owner_id, list_name, place_id)` and owner-scoped RLS. Consumed by Task 5.

- [ ] **Step 1: Write the migration**

```sql
-- 0011_saved_places.sql — cross-trip personal collection imported from Google Takeout.
-- RLS mirrors 0009_user_place_index.sql: each user only ever sees/writes their own rows.
create table if not exists public.saved_places (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  list_name  text not null,
  source     text not null check (source in ('takeout_starred','takeout_list','takeout_labeled')),
  place_id   text not null,
  place      jsonb not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, list_name, place_id)
);
create index if not exists saved_places_owner_idx on public.saved_places(owner_id);

alter table public.saved_places enable row level security;

drop policy if exists saved_places_select_own on public.saved_places;
create policy saved_places_select_own on public.saved_places
  for select using (auth.uid() = owner_id);

drop policy if exists saved_places_insert_own on public.saved_places;
create policy saved_places_insert_own on public.saved_places
  for insert with check (auth.uid() = owner_id);

drop policy if exists saved_places_update_own on public.saved_places;
create policy saved_places_update_own on public.saved_places
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists saved_places_delete_own on public.saved_places;
create policy saved_places_delete_own on public.saved_places
  for delete using (auth.uid() = owner_id);
```

- [ ] **Step 2: Verify SQL applies locally**

Run: `supabase db reset` (or apply `0011` against the local shadow DB).
Expected: no SQL errors; `saved_places` exists with 4 policies.
If no local Supabase is available, verify by SQL lint / review and note it for the migration deploy step; the action tests in Task 5 mock the DB and do not need this applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_saved_places.sql
git commit -m "feat(db): saved_places table for Takeout collection import"
```

---

### Task 2: Takeout parser (GeoJSON + CSV)

**Files:**
- Create: `lib/takeout/parse.ts`
- Create: `__tests__/takeout-parse.test.ts`
- Create: `__tests__/fixtures/takeout-saved-places.json`
- Create: `__tests__/fixtures/takeout-list.csv`

**Interfaces:**
- Produces: `type SavedPlaceEntry = { listName: string; source: 'takeout_starred'|'takeout_list'|'takeout_labeled'; title: string; note: string | null; lat: number | null; lng: number | null }` and `parseTakeoutFile(filename: string, content: string): SavedPlaceEntry[]`. Consumed by Task 5.

- [ ] **Step 1: Write the fixtures**

`__tests__/fixtures/takeout-saved-places.json`:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "geometry": { "type": "Point", "coordinates": [120.2, 22.99] },
      "properties": {
        "Title": "度小月",
        "Location": { "Address": "台南市中西區", "Business Name": "度小月擔仔麵" },
        "Google Maps URL": "https://www.google.com/maps/place/?q=place_id:ChIJd0"
      }
    },
    {
      "geometry": null,
      "properties": { "Title": "無座標景點", "Google Maps URL": "https://maps.google.com/?cid=1" }
    }
  ]
}
```

`__tests__/fixtures/takeout-list.csv`:
```csv
Title,Note,URL
"花園夜市","週四、六、日","https://www.google.com/maps/place/?q=place_id:ChIJa1"
"永樂,燒肉","逗號測試","https://www.google.com/maps/place/?q=place_id:ChIJb2"
```

- [ ] **Step 2: Write the failing test**

`__tests__/takeout-parse.test.ts`:
```ts
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseTakeoutFile } from '@/lib/takeout/parse'

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8')

it('parses starred GeoJSON into entries, keeping missing coords as null', () => {
  const entries = parseTakeoutFile('Saved Places.json', fixture('takeout-saved-places.json'))
  expect(entries).toHaveLength(2)
  expect(entries[0]).toEqual({
    listName: '已加星號', source: 'takeout_starred',
    title: '度小月', note: null, lat: 22.99, lng: 120.2,
  })
  expect(entries[1]).toMatchObject({ title: '無座標景點', lat: null, lng: null })
})

it('parses a list CSV, deriving list name from filename and handling quoted commas', () => {
  const entries = parseTakeoutFile('花園美食.csv', fixture('takeout-list.csv'))
  expect(entries).toHaveLength(2)
  expect(entries[0]).toEqual({
    listName: '花園美食', source: 'takeout_list',
    title: '花園夜市', note: '週四、六、日', lat: null, lng: null,
  })
  expect(entries[1].title).toBe('永樂,燒肉')
})

it('classifies a "Labeled places" CSV as takeout_labeled', () => {
  const entries = parseTakeoutFile('Labeled places.csv', 'Title,Note,URL\n"家","","https://x"')
  expect(entries[0].source).toBe('takeout_labeled')
})

it('throws a clear error on unrecognized content', () => {
  expect(() => parseTakeoutFile('junk.txt', 'not json not csv header')).toThrow(/無法辨識/)
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest takeout-parse -t "parses starred"`
Expected: FAIL with "Cannot find module '@/lib/takeout/parse'".

- [ ] **Step 4: Write the parser**

`lib/takeout/parse.ts`:
```ts
export type SavedPlaceSource = 'takeout_starred' | 'takeout_list' | 'takeout_labeled'

export interface SavedPlaceEntry {
  listName: string
  source: SavedPlaceSource
  title: string
  note: string | null
  lat: number | null
  lng: number | null
}

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (inQuotes) {
      if (c === '"' && content[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQuotes = false
      else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) rows.push(row) }
  return rows
}

function parseCsv(filename: string, content: string): SavedPlaceEntry[] {
  const base = filename.replace(/\.csv$/i, '')
  const isLabeled = /^labeled places$/i.test(base) || base === '已加標籤的地點'
  const source: SavedPlaceSource = isLabeled ? 'takeout_labeled' : 'takeout_list'
  const rows = parseCsvRows(content)
  const [header, ...body] = rows
  if (!header) return []
  const titleIdx = header.findIndex((h) => /^title$/i.test(h.trim()))
  const noteIdx = header.findIndex((h) => /^note$/i.test(h.trim()))
  return body
    .map((cols) => ({
      listName: base,
      source,
      title: (cols[titleIdx] ?? '').trim(),
      note: noteIdx >= 0 && cols[noteIdx]?.trim() ? cols[noteIdx].trim() : null,
      lat: null,
      lng: null,
    }))
    .filter((e) => e.title.length > 0)
}

interface GeoFeature {
  geometry: { coordinates?: [number, number] } | null
  properties?: { Title?: string; Location?: { ['Business Name']?: string } }
}

function parseGeoJson(content: string): SavedPlaceEntry[] {
  const data = JSON.parse(content) as { features?: GeoFeature[] }
  return (data.features ?? [])
    .map((f) => {
      const coords = f.geometry?.coordinates
      const title = f.properties?.Title ?? f.properties?.Location?.['Business Name'] ?? ''
      return {
        listName: '已加星號',
        source: 'takeout_starred' as const,
        title: title.trim(),
        note: null,
        lat: Array.isArray(coords) ? coords[1] : null,
        lng: Array.isArray(coords) ? coords[0] : null,
      }
    })
    .filter((e) => e.title.length > 0)
}

export function parseTakeoutFile(filename: string, content: string): SavedPlaceEntry[] {
  const trimmed = content.trimStart()
  if (/\.json$/i.test(filename) || (trimmed.startsWith('{') && trimmed.includes('FeatureCollection'))) {
    return parseGeoJson(content)
  }
  if (/\.csv$/i.test(filename) || /^title\s*,/i.test(trimmed)) {
    return parseCsv(filename, content)
  }
  throw new Error('無法辨識的檔案格式，請上傳 Google Takeout 匯出的 JSON 或 CSV')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest takeout-parse`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/takeout/parse.ts __tests__/takeout-parse.test.ts __tests__/fixtures/takeout-saved-places.json __tests__/fixtures/takeout-list.csv
git commit -m "feat(takeout): parse saved-places GeoJSON and list CSV"
```

---

### Task 3: Google-types → PlaceType classifier

**Files:**
- Create: `lib/takeout/classify.ts`
- Create: `__tests__/takeout-classify.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `classifyPlaceType(googleTypes: string[]): PlaceType`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

`__tests__/takeout-classify.test.ts`:
```ts
import { classifyPlaceType } from '@/lib/takeout/classify'

it('maps bakery/cafe/ice_cream to dessert', () => {
  expect(classifyPlaceType(['bakery', 'store'])).toBe('dessert')
  expect(classifyPlaceType(['cafe'])).toBe('dessert')
  expect(classifyPlaceType(['ice_cream_shop'])).toBe('dessert')
})

it('maps restaurant/food/meal to restaurant', () => {
  expect(classifyPlaceType(['restaurant', 'food'])).toBe('restaurant')
  expect(classifyPlaceType(['meal_takeaway'])).toBe('restaurant')
})

it('maps lodging to accommodation', () => {
  expect(classifyPlaceType(['lodging'])).toBe('accommodation')
})

it('falls back to attraction', () => {
  expect(classifyPlaceType(['tourist_attraction'])).toBe('attraction')
  expect(classifyPlaceType([])).toBe('attraction')
})

it('prefers dessert over restaurant when both present (cafe that also serves food)', () => {
  expect(classifyPlaceType(['cafe', 'restaurant', 'food'])).toBe('dessert')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest takeout-classify`
Expected: FAIL with "Cannot find module '@/lib/takeout/classify'".

- [ ] **Step 3: Write the classifier**

`lib/takeout/classify.ts`:
```ts
import type { PlaceType } from '@/lib/types'

const DESSERT = new Set(['bakery', 'cafe', 'ice_cream_shop', 'ice_cream', 'confectionery', 'dessert', 'dessert_shop'])
const RESTAURANT = new Set(['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'diner', 'bar'])
const LODGING = new Set(['lodging', 'hotel', 'motel', 'resort_hotel', 'guest_house'])

// Dessert is checked before restaurant so a "cafe + restaurant + food" place lands
// in dessert (matches the app's cafe-first bias in lib/utils/placeShortDescription.ts).
export function classifyPlaceType(googleTypes: string[]): PlaceType {
  const set = new Set(googleTypes)
  if ([...DESSERT].some((t) => set.has(t))) return 'dessert'
  if ([...LODGING].some((t) => set.has(t))) return 'accommodation'
  if ([...RESTAURANT].some((t) => set.has(t))) return 'restaurant'
  return 'attraction'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest takeout-classify`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/takeout/classify.ts __tests__/takeout-classify.test.ts
git commit -m "feat(takeout): classify Google place types into app category"
```

---

### Task 4: Essentials resolver

**Files:**
- Create: `app/actions/savedPlacesResolve.ts`
- Create: `__tests__/saved-places-resolve.test.ts`

**Interfaces:**
- Consumes: `classifyPlaceType` (Task 3); `readCachedPlaceId`/`writeCachedPlaceId` from `@/lib/placeIdCache`; `trackedApiFetch` from `@/lib/apiUsageEvents`; `googleMapsFetchOptions` from `@/lib/googleMapsCost`.
- Produces: `type ResolvedStub = { placeId: string; name: string; type: PlaceType; lat: number; lng: number; address: string }` and `resolvePlaceEssentials(title: string, coords?: { lat: number; lng: number }): Promise<ResolvedStub | null>`. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

`__tests__/saved-places-resolve.test.ts`:
```ts
const findPlaceResponse = { candidates: [{ place_id: 'ChIJx' }] }
const detailsResponse = {
  status: 'OK',
  result: {
    place_id: 'ChIJx', name: '度小月',
    geometry: { location: { lat: 22.99, lng: 120.2 } },
    formatted_address: '台南市中西區', types: ['restaurant', 'food'],
  },
}

const trackedApiFetch = jest.fn()
jest.mock('@/lib/apiUsageEvents', () => ({ trackedApiFetch: (...a: unknown[]) => trackedApiFetch(...a) }))
jest.mock('@/lib/googleMapsCost', () => ({ googleMapsFetchOptions: () => ({}), roundedCoordinate: (n: number) => n }))
const readCachedPlaceId = jest.fn()
const writeCachedPlaceId = jest.fn()
jest.mock('@/lib/placeIdCache', () => ({
  readCachedPlaceId: (...a: unknown[]) => readCachedPlaceId(...a),
  writeCachedPlaceId: (...a: unknown[]) => writeCachedPlaceId(...a),
}))

import { resolvePlaceEssentials } from '@/app/actions/savedPlacesResolve'

beforeEach(() => {
  jest.clearAllMocks()
  readCachedPlaceId.mockResolvedValue(null)
  trackedApiFetch
    .mockResolvedValueOnce({ json: async () => findPlaceResponse })  // find place (free id)
    .mockResolvedValueOnce({ json: async () => detailsResponse })    // details essentials
})

it('resolves title to a typed stub via find-place + essentials details', async () => {
  const stub = await resolvePlaceEssentials('度小月', { lat: 22.99, lng: 120.2 })
  expect(stub).toEqual({
    placeId: 'ChIJx', name: '度小月', type: 'restaurant',
    lat: 22.99, lng: 120.2, address: '台南市中西區',
  })
})

it('requests only essentials fields (no photos/opening_hours/editorial) and tags the essentials SKU', async () => {
  await resolvePlaceEssentials('度小月')
  const detailsUrl = trackedApiFetch.mock.calls[1][0] as string
  expect(detailsUrl).toContain('types')
  expect(detailsUrl).not.toContain('photos')
  expect(detailsUrl).not.toContain('opening_hours')
  expect(trackedApiFetch.mock.calls[1][2]).toMatchObject({ skuHint: 'place_details_essentials' })
})

it('reuses a cached place_id without calling find-place', async () => {
  readCachedPlaceId.mockResolvedValue('ChIJcached')
  trackedApiFetch.mockReset().mockResolvedValueOnce({ json: async () => detailsResponse })
  const stub = await resolvePlaceEssentials('度小月')
  expect(stub?.placeId).toBe('ChIJcached')
  expect(trackedApiFetch).toHaveBeenCalledTimes(1) // details only
})

it('returns null when find-place yields no candidate', async () => {
  trackedApiFetch.mockReset().mockResolvedValueOnce({ json: async () => ({ candidates: [] }) })
  expect(await resolvePlaceEssentials('查無此地')).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest saved-places-resolve`
Expected: FAIL with "Cannot find module '@/app/actions/savedPlacesResolve'".

- [ ] **Step 3: Write the resolver**

`app/actions/savedPlacesResolve.ts`:
```ts
'use server'
import type { PlaceType } from '@/lib/types'
import { googleMapsFetchOptions } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { readCachedPlaceId, writeCachedPlaceId } from '@/lib/placeIdCache'
import { classifyPlaceType } from '@/lib/takeout/classify'

const KEY = process.env.GOOGLE_MAPS_API_KEY!
const BASE = 'https://maps.googleapis.com/maps/api/place'
// Essentials-tier fields: type/coords/name/address only. NO photos/opening_hours/
// editorial (those are Pro and are fetched lazily via getPlaceDetails at add-time).
const ESSENTIALS_FIELDS = ['place_id', 'name', 'geometry', 'formatted_address', 'types'].join(',')

export interface ResolvedStub {
  placeId: string
  name: string
  type: PlaceType
  lat: number
  lng: number
  address: string
}

async function findPlaceId(title: string, coords?: { lat: number; lng: number }): Promise<string | null> {
  const cached = await readCachedPlaceId(title)
  if (cached) return cached
  const params = new URLSearchParams({ input: title, inputtype: 'textquery', fields: 'place_id', key: KEY })
  if (coords) params.set('locationbias', `point:${coords.lat},${coords.lng}`)
  const res = await trackedApiFetch(`${BASE}/findplacefromtext/json?${params.toString()}`, googleMapsFetchOptions(), {
    provider: 'google_maps', endpoint: 'find_place_from_text', skuHint: 'find_place_from_text_id_only',
  })
  const data = await res.json()
  const placeId = data.candidates?.[0]?.place_id ?? null
  if (placeId) await writeCachedPlaceId(title, undefined, placeId)
  return placeId
}

export async function resolvePlaceEssentials(
  title: string,
  coords?: { lat: number; lng: number },
): Promise<ResolvedStub | null> {
  const placeId = await findPlaceId(title, coords)
  if (!placeId) return null
  const params = new URLSearchParams({ place_id: placeId, fields: ESSENTIALS_FIELDS, key: KEY, language: 'zh-TW' })
  const res = await trackedApiFetch(`${BASE}/details/json?${params.toString()}`, googleMapsFetchOptions(), {
    provider: 'google_maps', endpoint: 'place_details', skuHint: 'place_details_essentials',
  })
  const data = await res.json()
  const r = data.result
  if (!r || data.status !== 'OK' || !r.geometry?.location) return null
  return {
    placeId: r.place_id ?? placeId,
    name: (r.name ?? title).trim(),
    type: classifyPlaceType(r.types ?? []),
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address ?? '',
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest saved-places-resolve`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/actions/savedPlacesResolve.ts __tests__/saved-places-resolve.test.ts
git commit -m "feat(saved-places): essentials-tier resolver (type+coords, no Pro fields)"
```

---

### Task 5: Import + list server actions

**Files:**
- Create: `app/actions/savedPlaces.ts`
- Create: `__tests__/saved-places-actions.test.ts`

**Interfaces:**
- Consumes: `SavedPlaceEntry`/`SavedPlaceSource` types (Task 2); `resolvePlaceEssentials` (Task 4); `createClient` from `@/lib/supabase/server`.
- Produces:
  - `importSavedPlaces(entries: SavedPlaceEntry[]): Promise<{ added: number; skipped: number; unresolved: number }>` — entries are parsed + selected **client-side** (the parser is pure), so only chosen places cost a resolve, and no non-serializable predicate crosses the server-action boundary.
  - `listSavedPlaces(): Promise<SavedPlaceRow[]>` where `SavedPlaceRow = { id: string; listName: string; source: SavedPlaceSource; place: Place }`.

- [ ] **Step 1: Write the failing test**

`__tests__/saved-places-actions.test.ts`:
```ts
const state: { user: { id: string } | null; rows: unknown[] } = { user: { id: 'user-1' }, rows: [] }
const upsert = jest.fn(async () => ({ error: null }))
const order = jest.fn(async () => ({ data: state.rows, error: null }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      upsert,
      select: () => ({ eq: () => ({ order }) }),
    }),
  }),
}))
const resolvePlaceEssentials = jest.fn()
jest.mock('@/app/actions/savedPlacesResolve', () => ({
  resolvePlaceEssentials: (...a: unknown[]) => resolvePlaceEssentials(...a),
}))

import { importSavedPlaces, listSavedPlaces } from '@/app/actions/savedPlaces'

beforeEach(() => {
  jest.clearAllMocks()
  state.user = { id: 'user-1' }
  resolvePlaceEssentials.mockImplementation(async (title: string) =>
    title === '查無此地' ? null : { placeId: `pid-${title}`, name: title, type: 'restaurant', lat: 1, lng: 2, address: 'addr' })
})

it('imports selected entries as owner-scoped stubs, counting unresolved', async () => {
  const entries = [
    { listName: '台南', source: 'takeout_list' as const, title: '度小月', note: null, lat: null, lng: null },
    { listName: '台南', source: 'takeout_list' as const, title: '查無此地', note: null, lat: null, lng: null },
  ]
  const result = await importSavedPlaces(entries)
  expect(result).toEqual({ added: 1, skipped: 0, unresolved: 1 })
  const payload = upsert.mock.calls[0][0][0] as Record<string, unknown>
  expect(payload).toMatchObject({ owner_id: 'user-1', list_name: '台南', source: 'takeout_list', place_id: 'pid-度小月' })
  expect((payload.place as { type: string }).type).toBe('restaurant')
})

it('throws when logged out', async () => {
  state.user = null
  const entries = [{ listName: 'x', source: 'takeout_list' as const, title: 'a', note: null, lat: null, lng: null }]
  await expect(importSavedPlaces(entries)).rejects.toThrow('NOT_AUTHENTICATED')
})

it('lists saved rows shaped as { id, listName, source, place }', async () => {
  state.rows = [{ id: 'r1', list_name: '台南', source: 'takeout_list', place: { placeId: 'p', name: 'X' } }]
  const rows = await listSavedPlaces()
  expect(rows[0]).toEqual({ id: 'r1', listName: '台南', source: 'takeout_list', place: { placeId: 'p', name: 'X' } })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest saved-places-actions`
Expected: FAIL with "Cannot find module '@/app/actions/savedPlaces'".

- [ ] **Step 3: Write the actions**

`app/actions/savedPlaces.ts`:
```ts
'use server'
import { randomUUID } from 'crypto'
import type { Place } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import type { SavedPlaceEntry, SavedPlaceSource } from '@/lib/takeout/parse'
import { resolvePlaceEssentials } from '@/app/actions/savedPlacesResolve'

export interface SavedPlaceRow {
  id: string
  listName: string
  source: SavedPlaceSource
  place: Place
}

function stubToPlace(stub: { placeId: string; name: string; type: Place['type']; lat: number; lng: number; address: string }): Place {
  return {
    id: randomUUID(),
    placeId: stub.placeId,
    name: stub.name,
    type: stub.type,
    lat: stub.lat,
    lng: stub.lng,
    address: stub.address,
    localizedName: null,
    localizedAddress: null,
    openingHours: null,
    rating: null,
    photoUrl: null,
    photoUrls: [],
    description: null,
  }
}

export async function importSavedPlaces(
  entries: SavedPlaceEntry[],
): Promise<{ added: number; skipped: number; unresolved: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')

  let added = 0, skipped = 0, unresolved = 0
  for (const entry of entries) {
    const coords = entry.lat != null && entry.lng != null ? { lat: entry.lat, lng: entry.lng } : undefined
    const stub = await resolvePlaceEssentials(entry.title, coords)
    if (!stub) { unresolved++; continue }
    const { error } = await supabase.from('saved_places').upsert([{
      owner_id: user.id,
      list_name: entry.listName,
      source: entry.source,
      place_id: stub.placeId,
      place: stubToPlace(stub),
      note: entry.note,
      updated_at: new Date().toISOString(),
    }], { onConflict: 'owner_id,list_name,place_id' })
    if (error) skipped++
    else added++
  }
  return { added, skipped, unresolved }
}

export async function listSavedPlaces(): Promise<SavedPlaceRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('saved_places')
    .select('id, list_name, source, place')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as { id: string; list_name: string; source: SavedPlaceSource; place: Place }[])
    .map((r) => ({ id: r.id, listName: r.list_name, source: r.source, place: r.place }))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest saved-places-actions`
Expected: PASS (3 tests).

- [ ] **Step 5: Full gate — typecheck, lint, all tests**

Run: `npx tsc --noEmit && npx eslint . && npx jest`
Expected: 0 type errors, 0 lint findings, all suites pass.

- [ ] **Step 6: Commit**

```bash
git add app/actions/savedPlaces.ts __tests__/saved-places-actions.test.ts
git commit -m "feat(saved-places): import + list server actions (owner-scoped, dedup upsert)"
```

---

## Follow-up plan (Part B, separate file)

The collection tab (SidePanel 4th tab as a saved-places recommendation engine) is a
separate plan `docs/superpowers/plans/2026-07-18-collection-tab.md`, written after this
foundation is reviewed and executed. It covers: the pure selection logic
(`resolveDayCenter` + `bucketByCategory` + `splitShownReserve` + `dedupeAndExclude` over
`listSavedPlaces()`), the `CollectionPanel` component reusing `DayRecommendations` /
`RecommendationCard`, the `SidePanelTab` `'collection'` wiring, and
`handleAddCollectionPlace` (hydrate via `getPlaceDetails` at add-time) plus archive/dismiss.
