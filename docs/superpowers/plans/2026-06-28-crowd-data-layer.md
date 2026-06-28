# 人潮資料層 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一個獨立的人潮資料層，對外提供 `getCrowdForecast(place) → CrowdForecast`（BestTime 優先、啟發式 fallback、可快取）。

**Architecture:** 全新檔 `lib/crowd/*` + 一支 server action `app/actions/crowd.ts`。內部 Approach A：先查快取 → 試 BestTime → 退啟發式。對 Lane A 只暴露 `getCrowdForecast` 與 `levelAt`，不動 Lane A 核心檔。

**Tech Stack:** Next.js 14 App Router、TypeScript strict、Jest（既有測試框架）、`fetch`（無新套件）。

**Spec:** `docs/superpowers/specs/2026-06-28-crowd-data-layer-design.md`

## Global Constraints

- TypeScript strict，**不得用 `any`**。
- **不新增 npm 套件**。
- **不修改 Lane A 的 6 個核心檔**：`lib/types.ts`、`lib/utils/clientScheduler.ts`、`app/actions/schedule.ts`、`app/actions/optimize.ts`、`components/ItineraryCard.tsx`、`app/itinerary/ItineraryClient.tsx`。可 `import type { Place }`（唯讀引用，非修改）。
- `BESTTIME_PRIVATE_KEY` 只在 server-side 讀取（`process.env`），**絕不進前端 bundle**。
- 測試框架：Jest。`@/` alias → 專案根目錄。測試放 `__tests__/`。test runner：`npx jest <path>`。
- `openingHours` 索引慣例：`openingHours[0]` = 星期一（與 `lib/utils/hours.ts` 既有 `(getDay()+6)%7` 對映一致）。`weekly` 同樣 day 0=週一..6=週日。
- 啟發式 `weekly` 內容**決定性**（同輸入同輸出）；`fetchedAt` 為時間戳不在決定性範圍，測試只斷言 `weekly`。
- 分支：`lane/ai-research`。每個 Task 結束 commit。

---

### Task 1: Crowd types + `levelAt`

**Files:**
- Create: `lib/crowd/types.ts`
- Test: `__tests__/crowd-types.test.ts`

**Interfaces:**
- Consumes: 無。
- Produces:
  - `type CrowdLevel = 'low' | 'medium' | 'high'`
  - `type CrowdSource = 'besttime' | 'heuristic'`
  - `interface CrowdForecast { source: CrowdSource; weekly: (number|null)[][]; fetchedAt: string; venueId?: string }`
  - `function levelAt(forecast: CrowdForecast, day: number, hour: number): CrowdLevel | null`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/crowd-types.test.ts
import { levelAt, type CrowdForecast } from '@/lib/crowd/types'

function fc(value: number | null): CrowdForecast {
  const weekly = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => value))
  return { source: 'heuristic', weekly, fetchedAt: '2026-06-28T00:00:00.000Z' }
}

test('null cell → null', () => {
  expect(levelAt(fc(null), 0, 9)).toBeNull()
})
test('< 40 → low', () => {
  expect(levelAt(fc(20), 0, 9)).toBe('low')
})
test('40–69 → medium', () => {
  expect(levelAt(fc(55), 0, 9)).toBe('medium')
})
test('>= 70 → high', () => {
  expect(levelAt(fc(85), 0, 9)).toBe('high')
})
test('out-of-range indices → null', () => {
  expect(levelAt(fc(50), 9, 99)).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/crowd-types.test.ts`
Expected: FAIL — cannot find module `@/lib/crowd/types`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/crowd/types.ts
export type CrowdLevel = 'low' | 'medium' | 'high'
export type CrowdSource = 'besttime' | 'heuristic'

export interface CrowdForecast {
  source: CrowdSource
  /** weekly[day][hour]; day 0=Mon..6=Sun; hour 0..23; 0–100 relative, or null = no data / closed */
  weekly: (number | null)[][]
  fetchedAt: string
  venueId?: string
}

const LOW_MAX = 40
const HIGH_MIN = 70

export function levelAt(forecast: CrowdForecast, day: number, hour: number): CrowdLevel | null {
  const v = forecast.weekly[day]?.[hour]
  if (v === null || v === undefined) return null
  if (v < LOW_MAX) return 'low'
  if (v < HIGH_MIN) return 'medium'
  return 'high'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/crowd-types.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crowd/types.ts __tests__/crowd-types.test.ts
git commit -m "feat(crowd): CrowdForecast types + levelAt bucketing"
```

---

### Task 2: In-memory cache

**Files:**
- Create: `lib/crowd/cache.ts`
- Test: `__tests__/crowd-cache.test.ts`

**Interfaces:**
- Consumes: `CrowdForecast` from `@/lib/crowd/types`.
- Produces:
  - `interface CrowdCache { get(key: string): CrowdForecast | undefined; set(key: string, value: CrowdForecast, ttlMs: number): void }`
  - `class InMemoryCrowdCache implements CrowdCache` — constructor accepts optional clock `(now?: () => number)` for deterministic TTL tests.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/crowd-cache.test.ts
import { InMemoryCrowdCache } from '@/lib/crowd/cache'
import type { CrowdForecast } from '@/lib/crowd/types'

const sample: CrowdForecast = {
  source: 'heuristic',
  weekly: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 10)),
  fetchedAt: '2026-06-28T00:00:00.000Z',
}

test('returns undefined for missing key', () => {
  const c = new InMemoryCrowdCache()
  expect(c.get('x')).toBeUndefined()
})
test('returns stored value before TTL', () => {
  let t = 1000
  const c = new InMemoryCrowdCache(() => t)
  c.set('x', sample, 5000)
  t = 2000
  expect(c.get('x')).toEqual(sample)
})
test('expires after TTL', () => {
  let t = 1000
  const c = new InMemoryCrowdCache(() => t)
  c.set('x', sample, 5000)
  t = 6001
  expect(c.get('x')).toBeUndefined()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/crowd-cache.test.ts`
Expected: FAIL — cannot find module `@/lib/crowd/cache`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/crowd/cache.ts
import type { CrowdForecast } from './types'

export interface CrowdCache {
  get(key: string): CrowdForecast | undefined
  set(key: string, value: CrowdForecast, ttlMs: number): void
}

interface Entry {
  value: CrowdForecast
  expiresAt: number
}

export class InMemoryCrowdCache implements CrowdCache {
  private store = new Map<string, Entry>()
  private now: () => number

  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  get(key: string): CrowdForecast | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (this.now() >= e.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return e.value
  }

  set(key: string, value: CrowdForecast, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/crowd-cache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crowd/cache.ts __tests__/crowd-cache.test.ts
git commit -m "feat(crowd): pluggable CrowdCache + InMemoryCrowdCache with TTL"
```

---

### Task 3: Heuristic estimator

**Files:**
- Create: `lib/crowd/heuristic.ts`
- Test: `__tests__/crowd-heuristic.test.ts`

**Interfaces:**
- Consumes: `Place` from `@/lib/types` (type-only); `CrowdForecast` from `@/lib/crowd/types`.
- Produces: `function estimateCrowd(place: Place): CrowdForecast` — `source:'heuristic'`, deterministic `weekly`.

**Behaviour:**
- 餐廳：午(11–13)/晚(17–20)尖峰；甜點：下午(14–17)；景點：週末白天(10–16)較高；住宿：`weekly` 全 `null`。
- `rating` 輕度調整（3.5 中性，每星 ±10%，夾 0.8–1.2）；無 rating → 中性。
- 營業時間 gate：該天該時段未營業 → 該格 `null`。`openingHours[0]`=週一。未知/無法解析 → 不 gate。

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/crowd-heuristic.test.ts
import { estimateCrowd } from '@/lib/crowd/heuristic'
import type { Place } from '@/lib/types'

function place(over: Partial<Place> = {}): Place {
  return {
    id: 'id', placeId: 'pid', name: 'X', type: 'attraction',
    lat: 0, lng: 0, address: 'addr', openingHours: null, rating: null,
    photoUrl: null, description: null, ...over,
  }
}

test('accommodation → all null', () => {
  const f = estimateCrowd(place({ type: 'accommodation' }))
  expect(f.source).toBe('heuristic')
  expect(f.weekly.flat().every((v) => v === null)).toBe(true)
})

test('restaurant lunch peak higher than mid-afternoon', () => {
  const f = estimateCrowd(place({ type: 'restaurant' }))
  // Monday 12:00 (lunch) vs 15:00 (off-peak)
  expect((f.weekly[0][12] ?? 0)).toBeGreaterThan(f.weekly[0][15] ?? 0)
})

test('attraction weekend midday higher than weekday midday', () => {
  const f = estimateCrowd(place({ type: 'attraction' }))
  // Saturday(5) 12:00 vs Monday(0) 12:00
  expect((f.weekly[5][12] ?? 0)).toBeGreaterThan(f.weekly[0][12] ?? 0)
})

test('closed hours gated to null', () => {
  // Monday 9AM–5PM only
  const oh = [
    'Monday: 9:00 AM – 5:00 PM', 'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM', 'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM', 'Saturday: 9:00 AM – 5:00 PM',
    'Sunday: 9:00 AM – 5:00 PM',
  ]
  const f = estimateCrowd(place({ type: 'attraction', openingHours: oh }))
  expect(f.weekly[0][8]).toBeNull()    // before open
  expect(f.weekly[0][12]).not.toBeNull() // open
  expect(f.weekly[0][18]).toBeNull()   // after close
})

test('deterministic weekly (same input → same weekly)', () => {
  const a = estimateCrowd(place({ type: 'restaurant', rating: 4.5 }))
  const b = estimateCrowd(place({ type: 'restaurant', rating: 4.5 }))
  expect(a.weekly).toEqual(b.weekly)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/crowd-heuristic.test.ts`
Expected: FAIL — cannot find module `@/lib/crowd/heuristic`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/crowd/heuristic.ts
import type { Place } from '@/lib/types'
import type { CrowdForecast } from './types'

type Curve = number[][] // [day 0..6][hour 0..23], multiplier 0..1

function flat(v: number): Curve {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => v))
}

function restaurantCurve(): Curve {
  const c = flat(0.15)
  const peaks: [number, number][] = [[11, 0.6], [12, 0.95], [13, 0.7], [17, 0.55], [18, 0.9], [19, 1.0], [20, 0.7]]
  for (let d = 0; d < 7; d++) {
    const weekend = d >= 5 ? 1.1 : 1
    for (const [h, v] of peaks) c[d][h] = Math.min(1, v * weekend)
  }
  return c
}

function dessertCurve(): Curve {
  const c = flat(0.2)
  for (let d = 0; d < 7; d++) for (let h = 14; h <= 17; h++) c[d][h] = d >= 5 ? 0.9 : 0.6
  return c
}

function attractionCurve(): Curve {
  const c = flat(0.2)
  for (let d = 0; d < 7; d++) {
    const weekend = d >= 5
    for (let h = 10; h <= 16; h++) c[d][h] = weekend ? 0.9 : 0.55
  }
  return c
}

const CURVES: Record<string, Curve> = {
  restaurant: restaurantCurve(),
  dessert: dessertCurve(),
  attraction: attractionCurve(),
}

function ratingFactor(rating: number | null): number {
  if (rating === null) return 1
  return Math.max(0.8, Math.min(1.2, 1 + (rating - 3.5) * 0.1))
}

function toMin(t: string): number | null {
  const ampm = t.trim().match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    const p = ampm[3].toUpperCase()
    if (p === 'PM' && h !== 12) h += 12
    if (p === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = t.trim().match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10)
  return null
}

/** [openMin, closeMin] for the day, or null = unknown (do not gate). [0,0] = closed all day. */
function dayWindow(entry: string | undefined): [number, number] | null {
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return [0, 0]
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  const m = rest.match(/^(.+?)\s*[–-]\s*(.+)$/)
  if (!m) return null
  const o = toMin(m[1])
  const c = toMin(m[2])
  if (o === null || c === null) return null
  return [o, c]
}

export function estimateCrowd(place: Place): CrowdForecast {
  const weekly: (number | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => null as number | null)
  )

  if (place.type !== 'accommodation') {
    const curve = CURVES[place.type] ?? CURVES.attraction
    const rf = ratingFactor(place.rating)
    for (let d = 0; d < 7; d++) {
      const win = dayWindow(place.openingHours?.[d])
      for (let h = 0; h < 24; h++) {
        if (win) {
          const [o, c] = win
          if (o === c) { weekly[d][h] = null; continue }          // closed all day
          if (c > o && !(h * 60 >= o && h * 60 < c)) { weekly[d][h] = null; continue } // outside same-day window
          // c < o (overnight): do not gate
        }
        weekly[d][h] = Math.round(Math.min(100, curve[d][h] * 100 * rf))
      }
    }
  }

  return { source: 'heuristic', weekly, fetchedAt: new Date().toISOString() }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/crowd-heuristic.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crowd/heuristic.ts __tests__/crowd-heuristic.test.ts
git commit -m "feat(crowd): deterministic heuristic estimator (type/rating/hours)"
```

---

### Task 4: BestTime client

**Files:**
- Create: `lib/crowd/besttime.ts`
- Test: `__tests__/crowd-besttime.test.ts`

**Interfaces:**
- Consumes: `Place` from `@/lib/types` (type-only); `CrowdForecast` from `@/lib/crowd/types`.
- Produces: `async function fetchBestTimeForecast(place: Place): Promise<CrowdForecast | null>` — `null` when no key / non-OK / error / timeout.

**BestTime response shape (confirmed via docs):** `{ status: 'OK'|'Error', venue_info: { venue_id }, analysis: [{ day_info: { day_int 0=Mon..6=Sun }, day_raw: number[24] (0–100), hour_analysis: [{ hour 0–23, intensity_nr (-2..2, 999=closed) }] }] }`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/crowd-besttime.test.ts
import { fetchBestTimeForecast } from '@/lib/crowd/besttime'
import type { Place } from '@/lib/types'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function place(): Place {
  return {
    id: 'id', placeId: 'pid', name: '鼎泰豐', type: 'restaurant',
    lat: 25, lng: 121, address: 'Taipei', openingHours: null, rating: 4.4,
    photoUrl: null, description: null,
  }
}

function dayObj(dayInt: number, fill: number) {
  return {
    day_info: { day_int: dayInt },
    day_raw: Array.from({ length: 24 }, () => fill),
    hour_analysis: [],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.BESTTIME_PRIVATE_KEY
})

test('returns null when no API key', async () => {
  const r = await fetchBestTimeForecast(place())
  expect(r).toBeNull()
  expect(mockFetch).not.toHaveBeenCalled()
})

test('parses analysis into weekly + venueId on OK', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK',
      venue_info: { venue_id: 'ven_abc' },
      analysis: [dayObj(0, 50), dayObj(6, 80)],
    }),
  })
  const r = await fetchBestTimeForecast(place())
  expect(r?.source).toBe('besttime')
  expect(r?.venueId).toBe('ven_abc')
  expect(r?.weekly[0][10]).toBe(50)
  expect(r?.weekly[6][10]).toBe(80)
  expect(r?.weekly[3][10]).toBeNull() // day not in analysis
})

test('closed hour (intensity_nr 999) → null', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK',
      venue_info: { venue_id: 'v' },
      analysis: [{ day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, () => 30), hour_analysis: [{ hour: 3, intensity_nr: 999 }] }],
    }),
  })
  const r = await fetchBestTimeForecast(place())
  expect(r?.weekly[0][3]).toBeNull()
  expect(r?.weekly[0][10]).toBe(30)
})

test('returns null on non-OK status', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({ json: async () => ({ status: 'Error' }) })
  expect(await fetchBestTimeForecast(place())).toBeNull()
})

test('returns null on fetch throw', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockRejectedValueOnce(new Error('network'))
  expect(await fetchBestTimeForecast(place())).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/crowd-besttime.test.ts`
Expected: FAIL — cannot find module `@/lib/crowd/besttime`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/crowd/besttime.ts
import type { Place } from '@/lib/types'
import type { CrowdForecast } from './types'

const ENDPOINT = 'https://besttime.app/api/v1/forecasts'
const TIMEOUT_MS = 5000

interface BestTimeHour { hour: number; intensity_nr: number }
interface BestTimeDay { day_info: { day_int: number }; day_raw: number[]; hour_analysis?: BestTimeHour[] }
interface BestTimeResponse { status: string; venue_info?: { venue_id?: string }; analysis?: BestTimeDay[] }

export async function fetchBestTimeForecast(place: Place): Promise<CrowdForecast | null> {
  const key = process.env.BESTTIME_PRIVATE_KEY
  if (!key) return null

  const url =
    `${ENDPOINT}?api_key_private=${encodeURIComponent(key)}` +
    `&venue_name=${encodeURIComponent(place.name)}` +
    `&venue_address=${encodeURIComponent(place.address)}`

  let json: BestTimeResponse
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal })
    clearTimeout(timer)
    json = (await res.json()) as BestTimeResponse
  } catch {
    return null
  }

  if (json.status !== 'OK' || !json.analysis) return null

  const weekly: (number | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => null as number | null)
  )
  for (const day of json.analysis) {
    const d = day.day_info?.day_int
    if (d === undefined || d < 0 || d > 6) continue
    for (let h = 0; h < 24; h++) weekly[d][h] = day.day_raw?.[h] ?? null
    for (const ha of day.hour_analysis ?? []) {
      if (ha.intensity_nr === 999 && ha.hour >= 0 && ha.hour < 24) weekly[d][ha.hour] = null
    }
  }

  return {
    source: 'besttime',
    weekly,
    fetchedAt: new Date().toISOString(),
    venueId: json.venue_info?.venue_id,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/crowd-besttime.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crowd/besttime.ts __tests__/crowd-besttime.test.ts
git commit -m "feat(crowd): BestTime forecast client (server-only key, null on failure)"
```

---

### Task 5: Orchestrator + server action

**Files:**
- Create: `lib/crowd/index.ts`
- Create: `app/actions/crowd.ts`
- Test: `__tests__/crowd-index.test.ts`

**Interfaces:**
- Consumes: `Place` (`@/lib/types`); `CrowdForecast`, `CrowdCache`, `InMemoryCrowdCache` (crowd modules); `fetchBestTimeForecast`; `estimateCrowd`.
- Produces:
  - `lib/crowd/index.ts`: `async function getCrowdForecast(place: Place, cache?: CrowdCache): Promise<CrowdForecast>` (cache param injectable for tests; defaults to a module-level `InMemoryCrowdCache`).
  - `app/actions/crowd.ts`: `'use server'` re-export `getCrowdForecast(place: Place): Promise<CrowdForecast>`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/crowd-index.test.ts
import { getCrowdForecast } from '@/lib/crowd'
import { InMemoryCrowdCache } from '@/lib/crowd/cache'
import type { Place } from '@/lib/types'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function place(over: Partial<Place> = {}): Place {
  return {
    id: 'id', placeId: 'pid', name: 'X', type: 'restaurant',
    lat: 0, lng: 0, address: 'addr', openingHours: null, rating: 4,
    photoUrl: null, description: null, ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.BESTTIME_PRIVATE_KEY
})

test('no key → falls back to heuristic', async () => {
  const f = await getCrowdForecast(place(), new InMemoryCrowdCache())
  expect(f.source).toBe('heuristic')
  expect(mockFetch).not.toHaveBeenCalled()
})

test('key + OK response → besttime source', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK',
      venue_info: { venue_id: 'v' },
      analysis: [{ day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, () => 42), hour_analysis: [] }],
    }),
  })
  const f = await getCrowdForecast(place(), new InMemoryCrowdCache())
  expect(f.source).toBe('besttime')
  expect(f.weekly[0][10]).toBe(42)
})

test('besttime null → falls back to heuristic', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({ json: async () => ({ status: 'Error' }) })
  const f = await getCrowdForecast(place(), new InMemoryCrowdCache())
  expect(f.source).toBe('heuristic')
})

test('second call hits cache (no second fetch)', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK', venue_info: { venue_id: 'v' },
      analysis: [{ day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, () => 42), hour_analysis: [] }],
    }),
  })
  const cache = new InMemoryCrowdCache()
  const p = place()
  await getCrowdForecast(p, cache)
  await getCrowdForecast(p, cache)
  expect(mockFetch).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/crowd-index.test.ts`
Expected: FAIL — cannot find module `@/lib/crowd`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/crowd/index.ts
import type { Place } from '@/lib/types'
import type { CrowdForecast } from './types'
import { fetchBestTimeForecast } from './besttime'
import { estimateCrowd } from './heuristic'
import { InMemoryCrowdCache, type CrowdCache } from './cache'

const TTL_BESTTIME_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
const TTL_HEURISTIC_MS = 24 * 60 * 60 * 1000      // 1 day

const defaultCache: CrowdCache = new InMemoryCrowdCache()

export async function getCrowdForecast(
  place: Place,
  cache: CrowdCache = defaultCache
): Promise<CrowdForecast> {
  const key = place.placeId || `${place.name}|${place.address}`

  const cached = cache.get(key)
  if (cached) return cached

  const bt = await fetchBestTimeForecast(place)
  if (bt) {
    cache.set(key, bt, TTL_BESTTIME_MS)
    return bt
  }

  const h = estimateCrowd(place)
  cache.set(key, h, TTL_HEURISTIC_MS)
  return h
}

export { levelAt } from './types'
export type { CrowdForecast, CrowdLevel, CrowdSource } from './types'
```

```ts
// app/actions/crowd.ts
'use server'
import type { Place } from '@/lib/types'
import type { CrowdForecast } from '@/lib/crowd/types'
import { getCrowdForecast as getForecast } from '@/lib/crowd'

export async function getCrowdForecast(place: Place): Promise<CrowdForecast> {
  return getForecast(place)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/crowd-index.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full crowd suite + typecheck**

Run: `npx jest __tests__/crowd-*.test.ts && npx tsc --noEmit`
Expected: all crowd tests PASS; tsc no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/crowd/index.ts app/actions/crowd.ts __tests__/crowd-index.test.ts
git commit -m "feat(crowd): getCrowdForecast orchestrator + server action (cache→besttime→heuristic)"
```

---

## Post-implementation (gated on key — NOT part of this plan's tasks)

拿到免費 `BESTTIME_PRIVATE_KEY` 後，對真實台/日/韓地點實打一次，確認 `weekly` 對映正確、覆蓋率可接受，並更新 `docs/superpowers/spikes/2026-06-28-crowd-data-findings.md`。

**⚠ 最優先（最終 whole-branch review 標記的 Important latent 項）：BestTime `day_raw` 對映基準。**
`besttime.ts` 目前把 `day_raw[h]` 當成時鐘小時 `h`，但 closed 覆蓋是用 `hour_analysis[].hour`（真實時鐘小時）。BestTime 的 `day_raw` 可能以「店家日 ~06:00 起算」偏移，兩個索引基準可能不一致。0–100 數值只存在於 `day_raw`，故正確對映**必須**用真實回應確認（`hour_analysis` 帶權威時鐘小時）。實打時：核對 `day_raw` 索引是否偏移，修正解析，並加一個「day_raw 帶 6 小時偏移 + 對應 hour_analysis」的 mock 測試鎖定對映。程式內已在該迴圈上方加註警告。

---

## Self-Review

**1. Spec coverage：**
- §2 介面（`CrowdForecast`/`levelAt`/`getCrowdForecast`）→ Task 1、Task 5. ✓
- §3 模組（types/heuristic/besttime/cache/index + action）→ Task 1–5. ✓
- §4 資料流 Approach A（cache→besttime→heuristic）→ Task 5. ✓
- §5 啟發式（type/rating/hours、住宿 null、決定性）→ Task 3. ✓
- §6 安全（key server-only、安靜 fallback、timeout）→ Task 4. ✓
- §7 測試（4 組 + mock）→ Task 1–5 各自測試. ✓
- §9 env var → Task 4 讀 `process.env`. ✓
- key 相依邊界 → 「Post-implementation」段落（不在任務內）. ✓

**2. Placeholder scan：** 無 TBD/TODO；每步皆有完整程式碼與指令。✓

**3. Type consistency：** `CrowdForecast`/`CrowdCache`/`getCrowdForecast(place, cache?)`/`fetchBestTimeForecast`/`estimateCrowd`/`levelAt` 在各 Task 間簽名一致；`weekly` 一律 `(number|null)[][]`、day 0=Mon。✓
