# 住宿排程（日期為準）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 當行程含 ≥1 個住宿時，初次規劃改用「容量感知就近分群 + 端點固定路線」：飯店依地理排成夜序、分配到 #2 日期決定的天、每天景點群聚到最近飯店並以飯店收尾；住宿不足的天提醒；停留時間低於建議時提醒。

**Architecture:** Task 1 抽出純 TSP 工具 `lib/tsp.ts` 並讓 `optimize.ts` 共用。Task 2 新增純函式 `lib/accommodation/cluster.ts`（夜序、指派、分群、每天路線）。Task 3 在 `schedule.ts` 接上 cluster 路徑（有住宿才走），保留現有時段填時間。Task 4 兩個衍生提醒：那天沒住宿（ItineraryDay）、停留低於建議（ItineraryCard）。

**Tech Stack:** Next.js 14, TypeScript strict, Jest。不新增 npm 套件。

## Global Constraints

- TypeScript strict，無 `any`。不新增 npm 套件。UI 文案繁體中文。
- **天數 = #2 起訖日的 N 天**（不變）；cluster 只在 `planItinerary`、有 ≥1 住宿時啟用；無住宿維持現有「按數量切天」。
- 飯店卡片 = 當晚那天**最後一張卡**；隔天路線以該飯店為起點參考但不重複出卡。
- `DAY_BUDGET = 720`（09:00–21:00 預設窗，分鐘）；只溢一天、不平分（決定性，同輸入同輸出）。
- 住宿不足提醒、建議停留提醒皆**衍生顯示，不新增必填欄位**（避免 fixture 遷移）。
- 既有測試需全數通過；新功能以 TDD 補測試。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/tsp.ts`（新） | 純：`nearestNeighbor`/`twoOpt`/`routeCost` |
| `app/actions/optimize.ts` | 改為 import `lib/tsp`（行為不變的 dedup） |
| `lib/accommodation/cluster.ts`（新） | `inferNightOrder`/`assignHotelsToDays`/`clusterAttractionsToDays`/`routeDay` |
| `app/actions/schedule.ts` | 有住宿時走 cluster 路徑；設 `nightIndex` |
| `lib/types.ts` | `Place.nightIndex?: number`（可選，零破壞） |
| `components/ItineraryDay.tsx` | 「⚠ 這天沒有住宿」（衍生） |
| `components/ItineraryCard.tsx` | 「⚠ 停留少於建議」（衍生自 DWELL）+ 住宿夜次徽章 |

---

## Task 1: 抽出純 TSP 工具 `lib/tsp.ts`

**Files:** Create `lib/tsp.ts`; Modify `app/actions/optimize.ts`; Test `__tests__/tsp.test.ts`

**Interfaces — Produces:** `nearestNeighbor(m: number[][], start?: number): number[]`、`twoOpt(route: number[], m: number[][]): number[]`、`routeCost(route: number[], m: number[][]): number`

- [ ] **Step 1: 失敗測試** — Create `__tests__/tsp.test.ts`:
```ts
import { nearestNeighbor, twoOpt, routeCost } from '@/lib/tsp'
const M = [
  [0, 1, 10, 10],
  [1, 0, 1, 10],
  [10, 1, 0, 1],
  [10, 10, 1, 0],
]
it('nearestNeighbor greedily walks nearest', () => {
  expect(nearestNeighbor(M, 0)).toEqual([0, 1, 2, 3])
})
it('routeCost sums consecutive edges', () => {
  expect(routeCost([0, 1, 2, 3], M)).toBe(3)
})
it('twoOpt does not worsen a route', () => {
  const r = twoOpt([0, 2, 1, 3], M)
  expect(routeCost(r, M)).toBeLessThanOrEqual(routeCost([0, 2, 1, 3], M))
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest tsp --silent` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** — Create `lib/tsp.ts`:
```ts
export function routeCost(route: number[], m: number[][]): number {
  let c = 0
  for (let i = 0; i < route.length - 1; i++) c += m[route[i]][route[i + 1]]
  return c
}
export function nearestNeighbor(m: number[][], start = 0): number[] {
  const n = m.length
  const visited = new Set<number>([start])
  const route = [start]
  let cur = start
  while (visited.size < n) {
    let best = -1
    let bd = Infinity
    for (let j = 0; j < n; j++) if (!visited.has(j) && m[cur][j] < bd) { best = j; bd = m[cur][j] }
    if (best < 0) break
    visited.add(best); route.push(best); cur = best
  }
  return route
}
export function twoOpt(route: number[], m: number[][]): number[] {
  let best = [...route]
  let improved = true
  while (improved) {
    improved = false
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        if (routeCost(cand, m) < routeCost(best, m)) { best = cand; improved = true }
      }
    }
  }
  return best
}
```

- [ ] **Step 4: refactor optimize.ts** — 刪除 `optimize.ts` 內本地的 `nearestNeighbor`/`routeCost`/`twoOpt`（line 4-53），改為：`import { nearestNeighbor, twoOpt } from '@/lib/tsp'`。`optimizeRoute`（line 55-60）邏輯不變。

- [ ] **Step 5: 跑測試 + build** — `npx jest tsp --silent` PASS；`npx jest --silent` 全綠（既有 optimize 行為不變）；`npm run build` 成功。

- [ ] **Step 6: Commit**
```bash
git add lib/tsp.ts app/actions/optimize.ts __tests__/tsp.test.ts
git commit -m "refactor: extract pure TSP helpers to lib/tsp; optimize.ts reuses them"
```

---

## Task 2: 住宿分群 `lib/accommodation/cluster.ts`

**Files:** Create `lib/accommodation/cluster.ts`; Test `__tests__/accommodation-cluster.test.ts`

**Interfaces — Consumes:** `nearestNeighbor`/`twoOpt`/`routeCost`（`lib/tsp`）、`haversineSeconds`（`lib/haversine`）、`Place`（`lib/types`）。
**Produces:**
- `inferNightOrder(hotels: Place[], attractions: Place[]): number[]`（hotels 索引的夜序）
- `assignHotelsToDays(orderedHotels: Place[], numDays: number): (Place | null)[]`（長度 numDays）
- `clusterAttractionsToDays(attractions: Place[], dayHotels: (Place|null)[], budgetMin: number, dwellOf: (p: Place) => number): Place[][]`（長度 numDays）
- `routeDay(prevHotel: Place | null, dayAttractions: Place[], thisHotel: Place | null): Place[]`（含 thisHotel 收尾，不含 prevHotel）

- [ ] **Step 1: 失敗測試** — Create `__tests__/accommodation-cluster.test.ts`:
```ts
import { inferNightOrder, assignHotelsToDays, clusterAttractionsToDays, routeDay } from '@/lib/accommodation/cluster'
import type { Place } from '@/lib/types'

function p(name: string, lat: number, lng: number, type: Place['type'] = 'attraction'): Place {
  return { id: name, placeId: name, name, type, lat, lng, address: '', openingHours: null, rating: null, photoUrl: null, description: null }
}
// 一維排開：A(0) H1(1) B(2) H2(3) C(4)
const H1 = p('H1', 0, 1, 'accommodation')
const H2 = p('H2', 0, 3, 'accommodation')
const A = p('A', 0, 0), B = p('B', 0, 2.7), C = p('C', 0, 4)

it('inferNightOrder returns a deterministic chain of hotel indices', () => {
  const order = inferNightOrder([H1, H2], [A, B, C])
  expect(order.slice().sort()).toEqual([0, 1])
  expect(order.length).toBe(2)
})

it('assignHotelsToDays maps night j to day j, capped at last day', () => {
  const days = assignHotelsToDays([H1, H2], 3)
  expect(days[0]).toBe(H1)
  expect(days[1]).toBe(H2)
  expect(days[2]).toBeNull()
})

it('clusterAttractionsToDays sends each attraction to its nearest hotel day', () => {
  const dayHotels = [H1, H2, null]
  const buckets = clusterAttractionsToDays([A, B, C], dayHotels, 720, () => 90)
  expect(buckets[0]).toContain(A) // A nearest H1
  expect(buckets[1]).toContain(B) // B nearest H2 (dist 1 vs H1 dist 1 → tie broken by placeId, but B at lng2 equal; accept either)
  expect(buckets[0].concat(buckets[1], buckets[2])).toHaveLength(3)
})

it('clusterAttractionsToDays overflows only one day when over budget', () => {
  // budget 120, dwell 90 → 2nd home attraction overflows to next day
  const dayHotels = [H1, H2]
  const A2 = p('A2', 0, 0.1)
  const buckets = clusterAttractionsToDays([A, A2], dayHotels, 120, () => 90)
  // both home to day0 by proximity; one overflows to day1
  expect(buckets[0]).toHaveLength(1)
  expect(buckets[1]).toHaveLength(1)
})

it('routeDay ends at thisHotel and excludes prevHotel from output', () => {
  const seq = routeDay(H1, [B], H2)
  expect(seq[seq.length - 1]).toBe(H2)
  expect(seq).not.toContain(H1)
  expect(seq).toContain(B)
})

it('routeDay with no hotels just returns the attractions ordered', () => {
  expect(routeDay(null, [A], null)).toEqual([A])
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest accommodation-cluster --silent` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** — Create `lib/accommodation/cluster.ts`:
```ts
import { haversineSeconds } from '@/lib/haversine'
import { nearestNeighbor, twoOpt, routeCost } from '@/lib/tsp'
import type { Place } from '@/lib/types'

type Geo = { lat: number; lng: number }
function centroid(pts: Geo[]): Geo {
  const n = pts.length
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / n, lng: pts.reduce((s, p) => s + p.lng, 0) / n }
}

export function inferNightOrder(hotels: Place[], attractions: Place[]): number[] {
  if (hotels.length <= 1) return hotels.map((_, i) => i)
  const c = centroid(attractions.length ? attractions : hotels)
  let seed = 0
  let sd = Infinity
  hotels.forEach((h, i) => { const d = haversineSeconds(h, c); if (d < sd) { sd = d; seed = i } })
  const m = hotels.map((a) => hotels.map((b) => haversineSeconds(a, b)))
  return twoOpt(nearestNeighbor(m, seed), m)
}

export function assignHotelsToDays(orderedHotels: Place[], numDays: number): (Place | null)[] {
  const dayHotels: (Place | null)[] = Array.from({ length: numDays }, () => null)
  orderedHotels.forEach((h, j) => {
    const d = Math.min(j, numDays - 1)
    if (dayHotels[d] === null) dayHotels[d] = h
  })
  return dayHotels
}

export function clusterAttractionsToDays(
  attractions: Place[],
  dayHotels: (Place | null)[],
  budgetMin: number,
  dwellOf: (p: Place) => number
): Place[][] {
  const N = dayHotels.length
  const buckets: Place[][] = Array.from({ length: N }, () => [])
  const hotelDays = dayHotels
    .map((h, d) => ({ h, d }))
    .filter((x): x is { h: Place; d: number } => x.h !== null)
  if (hotelDays.length === 0) { buckets[0] = [...attractions]; return buckets }

  const home: number[][] = Array.from({ length: N }, () => [])
  attractions.forEach((a, idx) => {
    let bestDay = hotelDays[0].d
    let bd = Infinity
    hotelDays.forEach(({ h, d }) => { const dist = haversineSeconds(a, h); if (dist < bd) { bd = dist; bestDay = d } })
    home[bestDay].push(idx)
  })

  const received: number[][] = Array.from({ length: N }, () => [])
  for (let d = 0; d < N; d++) {
    received[d].forEach((idx) => buckets[d].push(attractions[idx]))
    const hotel = dayHotels[d]
    const queue = home[d].slice()
    if (hotel) {
      queue.sort((x, y) => {
        const dx = haversineSeconds(attractions[x], hotel)
        const dy = haversineSeconds(attractions[y], hotel)
        return dx - dy || attractions[x].placeId.localeCompare(attractions[y].placeId)
      })
    }
    let load = received[d].reduce((s, idx) => s + dwellOf(attractions[idx]), 0)
    const isLast = d === N - 1
    for (const idx of queue) {
      const dwell = dwellOf(attractions[idx])
      if (!isLast && load + dwell > budgetMin) {
        received[d + 1].push(idx)
      } else {
        buckets[d].push(attractions[idx]); load += dwell
      }
    }
  }
  return buckets
}

export function routeDay(prevHotel: Place | null, dayAttractions: Place[], thisHotel: Place | null): Place[] {
  if (dayAttractions.length === 0) return thisHotel ? [thisHotel] : []
  const nodes: Place[] = [
    ...(prevHotel ? [prevHotel] : []),
    ...dayAttractions,
    ...(thisHotel ? [thisHotel] : []),
  ]
  const n = nodes.length
  const m = nodes.map((a) => nodes.map((b) => haversineSeconds(a, b)))
  const hasStart = !!prevHotel
  const hasEnd = !!thisHotel
  const startIdx = hasStart ? 0 : -1
  const endIdx = hasEnd ? n - 1 : -1
  const middle: number[] = []
  for (let i = 0; i < n; i++) if (i !== startIdx && i !== endIdx) middle.push(i)

  const order: number[] = []
  const visited = new Set<number>()
  let cur = hasStart ? startIdx : middle[0]
  order.push(cur); visited.add(cur)
  while (visited.size < (hasStart ? 1 : 0) + middle.length) {
    let best = -1
    let bd = Infinity
    for (const j of middle) if (!visited.has(j) && m[cur][j] < bd) { best = j; bd = m[cur][j] }
    if (best < 0) break
    order.push(best); visited.add(best); cur = best
  }
  if (hasEnd) order.push(endIdx)

  const posHi = order.length - 1 - (hasEnd ? 1 : 0)
  let best = [...order]
  let improved = true
  while (improved) {
    improved = false
    for (let i = Math.max(1, hasStart ? 1 : 0); i <= posHi; i++) {
      for (let j = i + 1; j <= posHi; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        if (routeCost(cand, m) < routeCost(best, m)) { best = cand; improved = true }
      }
    }
  }
  return best.map((i) => nodes[i]).filter((pl) => pl !== prevHotel)
}
```

- [ ] **Step 4: 跑測試確認通過** — `npx jest accommodation-cluster --silent` → PASS（6 tests）。

- [ ] **Step 5: Commit**
```bash
git add lib/accommodation/cluster.ts __tests__/accommodation-cluster.test.ts
git commit -m "feat: accommodation clustering (night order, day assignment, fill-forward, fixed-end route)"
```

---

## Task 3: 接上 schedule.ts cluster 路徑 + nightIndex

**Files:** Modify `lib/types.ts`, `app/actions/schedule.ts`; Test `__tests__/schedule-accommodation.test.ts`

**Interfaces — Consumes:** Task 2 的四個 cluster 函式；`DWELL`（`lib/placeType`）。
**Produces:** `Place.nightIndex?: number`（可選）；`schedulePlaces` 在含住宿時走 cluster 路徑。

- [ ] **Step 1: 失敗測試** — Create `__tests__/schedule-accommodation.test.ts`:
```ts
import { schedulePlaces } from '@/app/actions/schedule'
import type { Place, DistanceMatrix } from '@/lib/types'

function p(name: string, lat: number, lng: number, type: Place['type'] = 'attraction'): Place {
  return { id: name, placeId: name, name, type, lat, lng, address: '', openingHours: null, rating: null, photoUrl: null, description: null }
}
// 退化距離矩陣（用 haversine fallback 在 schedule 內不需要；給空 indices 讓 travelSecs 回 0）
const emptyMatrix: DistanceMatrix = { indices: [], matrix: [] }

it('with accommodation, each non-last day ends at a hotel card', async () => {
  const places = [
    p('A', 0, 0), p('H1', 0, 1, 'accommodation'),
    p('B', 0, 2), p('H2', 0, 3, 'accommodation'),
  ]
  const days = await schedulePlaces(places, emptyMatrix, 3, '2026-06-28')
  expect(days).toHaveLength(3)
  // day1 last card is an accommodation; day2 last card is an accommodation
  expect(days[0].places[days[0].places.length - 1].type).toBe('accommodation')
  expect(days[1].places[days[1].places.length - 1].type).toBe('accommodation')
})

it('hotels get a 1-indexed nightIndex', async () => {
  const places = [p('A', 0, 0), p('H1', 0, 1, 'accommodation')]
  const days = await schedulePlaces(places, emptyMatrix, 2, '2026-06-28')
  const hotel = days.flatMap((d) => d.places).find((pl) => pl.type === 'accommodation')
  expect(hotel?.nightIndex).toBe(1)
})

it('without accommodation, falls back to count-based chunking (unchanged)', async () => {
  const places = [p('A', 0, 0), p('B', 0, 1), p('C', 0, 2), p('D', 0, 3)]
  const days = await schedulePlaces(places, emptyMatrix, 2, '2026-06-28')
  expect(days).toHaveLength(2)
  expect(days.flatMap((d) => d.places)).toHaveLength(4)
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest schedule-accommodation --silent` → FAIL（cluster 路徑未接、無 nightIndex）。

- [ ] **Step 3: 型別** — In `lib/types.ts` `Place`（line 4-16）末尾加 `nightIndex?: number   // 住宿夜次（1-indexed），僅 accommodation` 之前一行加逗號。可選欄位，零破壞。

- [ ] **Step 4: schedule.ts cluster 路徑** — In `app/actions/schedule.ts`：
  - import 加：`import { inferNightOrder, assignHotelsToDays, clusterAttractionsToDays, routeDay } from '@/lib/accommodation/cluster'`
  - 抽出每天時間填寫為一個 helper（沿用現有 cursor/餐別/警告邏輯），讓兩條路徑共用。在 `schedulePlaces` 內，先判斷是否含住宿；若有，走 cluster 路徑產生「每天 ordered Place[]」，否則維持現有 chunk 路徑。
  - cluster 路徑：
    ```ts
    const DAY_BUDGET_MIN = 720
    const hotels = orderedPlaces.filter((p) => p.type === 'accommodation')
    let dayOrderedPlaces: Place[][]
    if (hotels.length > 0) {
      const nonHotels = orderedPlaces.filter((p) => p.type !== 'accommodation')
      const nightOrderIdx = inferNightOrder(hotels, nonHotels)
      const orderedHotels = nightOrderIdx.map((i) => ({ ...hotels[i], nightIndex: 0 }))
      orderedHotels.forEach((h, j) => { h.nightIndex = j + 1 })
      const dayHotels = assignHotelsToDays(orderedHotels, days)
      const buckets = clusterAttractionsToDays(nonHotels, dayHotels, DAY_BUDGET_MIN, (p) => DWELL[p.type])
      dayOrderedPlaces = dayHotels.map((thisHotel, d) => {
        const prevHotel = d > 0 ? dayHotels[d - 1] : null
        return routeDay(prevHotel, buckets[d], thisHotel)
      })
    } else {
      // 既有 chunk 路徑：產生每天 ordered（沿用原 am/lunch/pm/dinner 排序）
      const chunkSize = Math.ceil(orderedPlaces.length / days)
      dayOrderedPlaces = Array.from({ length: days }, (_, d) => mealOrder(orderedPlaces.slice(d * chunkSize, (d + 1) * chunkSize)))
    }
    ```
    其中 `mealOrder(chunk)` 把現有 line 40-59 的 am/lunch/pm/dinner 排序抽成函式回傳 `Place[]`。
  - 時間填寫沿用現有 line 62-100 邏輯，但改為迭代 `dayOrderedPlaces[dayIdx]`（取代原 `ordered`）；餐別 snap（午餐 12:00／晚餐 18:00）以「該天第 1／第 2 個 restaurant」判斷（cluster 路徑同樣適用）。住宿節點用 `DWELL.accommodation`，不綁餐別。`nightIndex` 來自 cluster 路徑指派；chunk 路徑住宿無 nightIndex（維持 undefined）。
  - 每天回傳維持 `{ day, places, aiSummary: null, dayStart:'09:00', dayEnd:'21:00' }`。

  > 實作備註：把 line 62-100 的「cursor＋snap＋warnings＋map 成 ScheduledPlace」抽成 `fillDay(orderedPlaces: Place[], dateIso, distMatrix): ScheduledPlace[]`，兩條路徑共用；snap 改以「迴圈中遇到的第 1/2 個 `type==='restaurant'`」觸發，取代依賴外部 `lunchRestaurant`/`dinnerRestaurant` 參考（cluster 路徑沒有那兩個變數）。

- [ ] **Step 5: 跑測試 + build** — `npx jest schedule-accommodation schedule --silent` PASS；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 6: Commit**
```bash
git add lib/types.ts app/actions/schedule.ts __tests__/schedule-accommodation.test.ts
git commit -m "feat: accommodation-aware scheduling path with nightIndex and hotel day anchors"
```

---

## Task 4: 衍生提醒（沒住宿的天 / 停留低於建議）+ 夜次徽章

**Files:** Modify `components/ItineraryDay.tsx`, `components/ItineraryCard.tsx`, `app/itinerary/ItineraryClient.tsx`; Test `__tests__/accommodation-warnings.test.tsx`

**Interfaces — Consumes:** `DWELL`、`TYPE_META`（`lib/placeType`）。
**Produces:** `ItineraryDay` 新增 `isLastDay?: boolean`。

- [ ] **Step 1: 失敗測試** — Create `__tests__/accommodation-warnings.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { ItineraryDay } from '@/components/ItineraryDay'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, type: ScheduledPlace['type'], over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type, lat: 0, lng: 0, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null, startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const day = (places: ScheduledPlace[]): DayItinerary => ({ day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' })

it('non-last day without accommodation shows the missing-lodging warning', () => {
  render(<ItineraryDay day={day([sp('A', 'attraction')])} dayIdx={0} mode="driving" startDate="2026-06-28" isLastDay={false} />)
  expect(screen.getByText(/這天沒有住宿/)).toBeInTheDocument()
})
it('last day without accommodation does NOT warn', () => {
  render(<ItineraryDay day={day([sp('A', 'attraction')])} dayIdx={0} mode="driving" startDate="2026-06-28" isLastDay={true} />)
  expect(screen.queryByText(/這天沒有住宿/)).not.toBeInTheDocument()
})
it('day with an accommodation card does NOT warn', () => {
  render(<ItineraryDay day={day([sp('A', 'attraction'), sp('H', 'accommodation')])} dayIdx={0} mode="driving" startDate="2026-06-28" isLastDay={false} />)
  expect(screen.queryByText(/這天沒有住宿/)).not.toBeInTheDocument()
})
it('card warns when durationMin is below the suggested DWELL', () => {
  // attraction DWELL = 90; 60 < 90 → warn
  render(<ItineraryCard place={sp('A', 'attraction', { durationMin: 60 })} index={0} dateIso="2026-06-30" />)
  expect(screen.getByText(/停留少於建議/)).toBeInTheDocument()
})
it('card does not warn when durationMin meets the suggested DWELL', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { durationMin: 90 })} index={0} dateIso="2026-06-30" />)
  expect(screen.queryByText(/停留少於建議/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest accommodation-warnings --silent` → FAIL。

- [ ] **Step 3: ItineraryDay 沒住宿提醒** — In `components/ItineraryDay.tsx`：
  - import 已有；Props 加 `isLastDay?: boolean`，解構加入。
  - 在標頭日期之後加（衍生）：
    ```tsx
    {!isLastDay && day.places.length > 0 && !day.places.some((p) => p.type === 'accommodation') && (
      <p className="text-xs text-orange-600 mb-2">&#x26A0; 這天沒有住宿</p>
    )}
    ```

- [ ] **Step 4: ItineraryClient 傳 isLastDay** — In `app/itinerary/ItineraryClient.tsx`，每個 `<ItineraryDay>` 加 `isLastDay={dayIdx === plan.days.length - 1}`。

- [ ] **Step 5: ItineraryCard 建議停留提醒 + 夜次徽章** — In `components/ItineraryCard.tsx`：
  - import 已有 `DWELL`（若無則 `import { DWELL, TYPE_META } from '@/lib/placeType'`）。
  - 在 `lateExit` 警告附近加：
    ```tsx
    {place.durationMin < DWELL[place.type] && (
      <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 停留少於建議（建議 {DWELL[place.type]} 分）</p>
    )}
    ```
  - 住宿夜次徽章（若 `place.nightIndex`）：在類型徽章附近加 `{place.nightIndex && <span className="text-xs text-purple-700">第 {place.nightIndex} 晚</span>}`。

- [ ] **Step 6: 跑測試 + build** — `npx jest accommodation-warnings --silent` PASS；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 7: Commit**
```bash
git add components/ItineraryDay.tsx components/ItineraryCard.tsx app/itinerary/ItineraryClient.tsx __tests__/accommodation-warnings.test.tsx
git commit -m "feat: missing-lodging day warning, below-suggested-duration card warning, night-index badge"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §3.1 夜序/分群/路線 → Task2；§3.2 端點固定 2-opt（routeDay 內）+ schedule 改走 cluster → Task2/3；修訂2 日期為準/飯店指派/卡片位置 → Task3；住宿不足提醒 → Task4；§3.3 建議停留提醒（DWELL 推導）→ Task4；nightIndex → Task3/4。
- **零破壞：** `nightIndex` 為可選欄位、提醒皆衍生顯示 → 無 fixture 遷移。`lib/tsp.ts` 抽取為行為不變的 dedup（既有 optimize 測試應全綠）。
- **型別一致：** `inferNightOrder`/`assignHotelsToDays`/`clusterAttractionsToDays`/`routeDay`、`nightIndex`、`isLastDay` 跨 task 命名一致。
- **不在範圍：** Day1 抵達點錨、最後一天回家結束時間（spec 標為 Lane A 後續）；人潮避峰（#7）；停留時間「系統自動縮短」（cluster 用溢出策略，不縮短；§3.3 提醒涵蓋手動縮短）。
