# 行程間交通時間 + 每段交通工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每段（地點→下一站）顯示交通工具+時間且可個別切換；預設 ≤500m 步行、>500m 取 Google 開車/大眾較快者；結構改變後 2 秒自動重算受影響段，保留相鄰未變的手動選擇。

**Architecture:** 純函式（`haversineMeters`、`pickLegDefault`、`legMerge`）+ 兩個伺服器動作（`computeLegPlan`、`legDuration`）。建立行程時以 `plan.ts` 的後置步驟 `applyLegDefaults` 指派每段預設並重算時間（**不動既有 `schedule.ts`**）。客戶端：手動改段呼叫 `legDuration`；結構改變掛既有 2 秒 debounce，跑 `computeLegPlan` + `legMerge` 重算。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Jest + Testing Library (jsdom)。

## Global Constraints

- TypeScript strict，無 `any`。不新增 npm 套件（距離矩陣既有 `buildDistanceMatrix`）。
- UI 文案繁體中文。
- 新欄位皆**可選** + 衍生讀取 → 零 fixture 遷移。
- 決定性：距離門檻 500m、取最快、平手 driving 優先；無 `Math.random`/`Date.now`。
- 結構改變的 leg 重算一律走既有 2 秒 debounce（拖曳零延遲感）。
- 路線排序與地圖嵌入維持 plan 模式不變；per-段為其上的顯示/計時層。
- 既有全測試需保持綠（`haversineSeconds` 為純抽取、行為不變；`schedule.ts` 不改）。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/haversine.ts`（改） | 新增 `haversineMeters`；`haversineSeconds` 改用它（行為不變） |
| `lib/utils/legDefault.ts`（新） | `pickLegDefault`（500m + 取最快規則，純） |
| `lib/utils/legMerge.ts`（新） | `legMerge`（保留手動 / 套預設，純） |
| `lib/types.ts`（改） | `ScheduledPlace.legMode?`/`legManualNext?`；`LegDefault` |
| `app/actions/legs.ts`（新） | `computeLegPlan`、`legDuration`、`applyLegDefaults` |
| `app/actions/plan.ts`（改） | `schedulePlaces` 後呼叫 `applyLegDefaults` |
| `components/ItineraryCard.tsx`（改） | 每段工具圖示+時間+下拉+loading |
| `components/ItineraryDay.tsx`（改） | 透傳 `onChangeLegMode`/`legBusyPlaceId` 給 Card |
| `app/itinerary/ItineraryClient.tsx`（改） | `handleChangeLegMode`、結構改變 2 秒 leg 重算、loading state |

---

## Task 1: 純基礎 — `haversineMeters` + `pickLegDefault` + 型別

**Files:** Modify `lib/haversine.ts`, `lib/types.ts`; Create `lib/utils/legDefault.ts`; Test `__tests__/leg-default.test.ts`

**Interfaces — Produces:**
- `haversineMeters(a: {lat;lng}, b: {lat;lng}): number`
- `interface LegDefault { legMode: TransportMode; travelMin: number }`（`lib/types.ts`）
- `ScheduledPlace.legMode?: TransportMode`、`legManualNext?: string`
- `pickLegDefault(distMeters: number, drivingMin: number, transitMin: number, walkingMin: number): LegDefault`

- [ ] **Step 1: 失敗測試** — Create `__tests__/leg-default.test.ts`:
```ts
import { haversineMeters, haversineSeconds } from '@/lib/haversine'
import { pickLegDefault } from '@/lib/utils/legDefault'

it('haversineMeters is 0 for identical points', () => {
  expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0)
})
it('haversineMeters ~1113m for 0.01° lng at equator', () => {
  expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 })).toBeCloseTo(1113, -1)
})
it('haversineSeconds equals round(meters / 1.4) — behavior unchanged', () => {
  const a = { lat: 25.03, lng: 121.56 }, b = { lat: 25.04, lng: 121.57 }
  expect(haversineSeconds(a, b)).toBe(Math.round(haversineMeters(a, b) / 1.4))
})
it('pickLegDefault: <=500m → walking', () => {
  expect(pickLegDefault(400, 10, 20, 8)).toEqual({ legMode: 'walking', travelMin: 8 })
})
it('pickLegDefault: >500m → faster of driving/transit', () => {
  expect(pickLegDefault(600, 10, 20, 40)).toEqual({ legMode: 'driving', travelMin: 10 })
  expect(pickLegDefault(600, 25, 12, 40)).toEqual({ legMode: 'transit', travelMin: 12 })
})
it('pickLegDefault: >500m tie → driving wins (deterministic)', () => {
  expect(pickLegDefault(600, 15, 15, 40)).toEqual({ legMode: 'driving', travelMin: 15 })
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest leg-default --silent` → FAIL（模組不存在）。

- [ ] **Step 3: haversineMeters** — In `lib/haversine.ts`，重構為（`haversineSeconds` 行為不變）:
```ts
const WALKING_SPEED_MPS = 1.4   // 5 km/h

export function haversineMeters(
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
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function haversineSeconds(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return Math.round(haversineMeters(a, b) / WALKING_SPEED_MPS)
}
```

- [ ] **Step 4: 型別** — In `lib/types.ts`：
  - `ScheduledPlace`（`durationLocked` 之後）加：
    ```ts
    legMode?: TransportMode    // 到下一站的交通工具（最後一站 undefined）
    legManualNext?: string     // 有值＝手動指定段，值為當時下一站的 place.id
    ```
  - 在 `DistanceMatrix` 附近加：
    ```ts
    export interface LegDefault {
      legMode: TransportMode
      travelMin: number
    }
    ```

- [ ] **Step 5: pickLegDefault** — Create `lib/utils/legDefault.ts`:
```ts
import type { LegDefault } from '@/lib/types'

const WALK_THRESHOLD_M = 500

export function pickLegDefault(
  distMeters: number,
  drivingMin: number,
  transitMin: number,
  walkingMin: number
): LegDefault {
  if (distMeters <= WALK_THRESHOLD_M) {
    return { legMode: 'walking', travelMin: walkingMin }
  }
  // 平手 driving 優先（決定性）
  return drivingMin <= transitMin
    ? { legMode: 'driving', travelMin: drivingMin }
    : { legMode: 'transit', travelMin: transitMin }
}
```

- [ ] **Step 6: 跑測試 + build** — `npx jest leg-default --silent` PASS（6 tests）；`npx jest --silent` 全綠（既有 haversine 用法不變）；`npm run build` 成功。

- [ ] **Step 7: Commit**
```bash
git add lib/haversine.ts lib/types.ts lib/utils/legDefault.ts __tests__/leg-default.test.ts
git commit -m "feat: haversineMeters + pickLegDefault (500m walk / fastest motorized) + leg types"
```

---

## Task 2: 伺服器動作 `computeLegPlan` + `legDuration`

**Files:** Create `app/actions/legs.ts`; Test `__tests__/legs-actions.test.ts`

**Interfaces — Consumes:** `buildDistanceMatrix(places, mode): Promise<{indices, matrix}>`（`@/app/actions/directions`）；`pickLegDefault`（Task 1）；`haversineMeters`（Task 1）；`LegDefault`（`@/lib/types`）。
**Produces:**
- `computeLegPlan(orderedPlaces: Place[]): Promise<LegDefault[]>`（長度 = places.length − 1；<2 站回 `[]`）
- `legDuration(origin: Place, dest: Place, mode: TransportMode): Promise<number>`

> 註：`applyLegDefaults` 在 Task 4 才加入本檔。

- [ ] **Step 1: 失敗測試** — Create `__tests__/legs-actions.test.ts`:
```ts
import { computeLegPlan, legDuration } from '@/app/actions/legs'
import type { Place, TransportMode } from '@/lib/types'

// 每個模式回不同的固定秒數，方便驗證取最快
const SECS: Record<TransportMode, number> = { driving: 600, walking: 2400, transit: 1500 }
jest.mock('@/app/actions/directions', () => ({
  buildDistanceMatrix: jest.fn(async (places: { placeId: string }[], mode: 'driving' | 'walking' | 'transit') => ({
    indices: places.map((p) => p.placeId),
    matrix: places.map(() => places.map(() => ({ driving: 600, walking: 2400, transit: 1500 }[mode]))),
  })),
}))

function p(name: string, lat = 0, lng = 0): Place {
  return { id: name, placeId: name, name, type: 'attraction', lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null }
}

it('computeLegPlan returns one LegDefault per leg', async () => {
  const out = await computeLegPlan([p('A', 0, 0), p('B', 0, 0.01), p('C', 0, 0.02)])
  expect(out).toHaveLength(2)
})
it('computeLegPlan: >500m leg picks fastest motorized (driving 10 < transit 25)', async () => {
  // 0.01° lng ≈ 1113m > 500 → motorized; driving 600s=10min vs transit 1500s=25min
  const out = await computeLegPlan([p('A', 0, 0), p('B', 0, 0.01)])
  expect(out[0]).toEqual({ legMode: 'driving', travelMin: 10 })
})
it('computeLegPlan: <=500m leg → walking', async () => {
  // 0.001° lng ≈ 111m <= 500 → walking (2400s = 40min)
  const out = await computeLegPlan([p('A', 0, 0), p('B', 0, 0.001)])
  expect(out[0]).toEqual({ legMode: 'walking', travelMin: 40 })
})
it('computeLegPlan returns [] for fewer than 2 places', async () => {
  expect(await computeLegPlan([p('A')])).toEqual([])
})
it('legDuration returns minutes for one leg + mode', async () => {
  expect(await legDuration(p('A'), p('B'), 'driving')).toBe(10)  // 600s
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest legs-actions --silent` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** — Create `app/actions/legs.ts`:
```ts
'use server'
import type { Place, TransportMode, DistanceMatrix, LegDefault } from '@/lib/types'
import { buildDistanceMatrix } from '@/app/actions/directions'
import { haversineMeters } from '@/lib/haversine'
import { pickLegDefault } from '@/lib/utils/legDefault'

function legMin(m: DistanceMatrix, i: number): number {
  return Math.round((m.matrix[i]?.[i + 1] ?? 0) / 60)
}

export async function computeLegPlan(orderedPlaces: Place[]): Promise<LegDefault[]> {
  const n = orderedPlaces.length
  if (n < 2) return []
  const [driving, walking, transit] = await Promise.all([
    buildDistanceMatrix(orderedPlaces, 'driving'),
    buildDistanceMatrix(orderedPlaces, 'walking'),
    buildDistanceMatrix(orderedPlaces, 'transit'),
  ])
  const out: LegDefault[] = []
  for (let i = 0; i < n - 1; i++) {
    const dist = haversineMeters(orderedPlaces[i], orderedPlaces[i + 1])
    out.push(pickLegDefault(dist, legMin(driving, i), legMin(transit, i), legMin(walking, i)))
  }
  return out
}

export async function legDuration(origin: Place, dest: Place, mode: TransportMode): Promise<number> {
  const m = await buildDistanceMatrix([origin, dest], mode)
  return Math.round((m.matrix[0]?.[1] ?? 0) / 60)
}
```

- [ ] **Step 4: 跑測試 + build** — `npx jest legs-actions --silent` PASS（5 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add app/actions/legs.ts __tests__/legs-actions.test.ts
git commit -m "feat: computeLegPlan + legDuration server actions (per-segment best mode)"
```

---

## Task 3: 純函式 `legMerge`（保留手動 / 套預設）

**Files:** Create `lib/utils/legMerge.ts`; Test `__tests__/leg-merge.test.ts`

**Interfaces — Consumes:** `LegDefault`（`@/lib/types`）、`ScheduledPlace`。
**Produces:** `legMerge(places: ScheduledPlace[], legPlan: LegDefault[]): ScheduledPlace[]`

- [ ] **Step 1: 失敗測試** — Create `__tests__/leg-merge.test.ts`:
```ts
import { legMerge } from '@/lib/utils/legMerge'
import type { ScheduledPlace, LegDefault } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const defaults: LegDefault[] = [
  { legMode: 'driving', travelMin: 18 },
  { legMode: 'walking', travelMin: 8 },
]

it('keeps a manual leg when its next place is unchanged', () => {
  // A manually set to transit toward B; A still precedes B → preserved
  const places = [sp('A', { legMode: 'transit', travelMinToNext: 25, legManualNext: 'B' }), sp('B'), sp('C')]
  const out = legMerge(places, defaults)
  expect(out[0].legMode).toBe('transit')
  expect(out[0].travelMinToNext).toBe(25)
  expect(out[0].legManualNext).toBe('B')
})
it('drops a manual leg when its recorded next no longer follows it', () => {
  // A manual toward B, but now A precedes C → reverts to default, clears legManualNext
  const places = [sp('A', { legMode: 'transit', travelMinToNext: 25, legManualNext: 'B' }), sp('C'), sp('B')]
  const out = legMerge(places, defaults)
  expect(out[0].legMode).toBe('driving')
  expect(out[0].travelMinToNext).toBe(18)
  expect(out[0].legManualNext).toBeUndefined()
})
it('applies defaults to non-manual legs', () => {
  const places = [sp('A'), sp('B'), sp('C')]
  const out = legMerge(places, defaults)
  expect(out[0].legMode).toBe('driving')
  expect(out[1].legMode).toBe('walking')
  expect(out[1].travelMinToNext).toBe(8)
})
it('clears the last place leg fields', () => {
  const places = [sp('A'), sp('B')]
  const out = legMerge(places, [{ legMode: 'driving', travelMin: 18 }])
  expect(out[1].legMode).toBeUndefined()
  expect(out[1].travelMinToNext).toBeNull()
  expect(out[1].legManualNext).toBeUndefined()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest leg-merge --silent` → FAIL。

- [ ] **Step 3: 實作** — Create `lib/utils/legMerge.ts`:
```ts
import type { ScheduledPlace, LegDefault } from '@/lib/types'

export function legMerge(places: ScheduledPlace[], legPlan: LegDefault[]): ScheduledPlace[] {
  return places.map((p, i) => {
    if (i === places.length - 1) {
      return { ...p, legMode: undefined, travelMinToNext: null, legManualNext: undefined }
    }
    const next = places[i + 1]
    // 手動段且相鄰未變 → 保留（同一對站 → 距離時間不變）
    if (p.legManualNext && p.legManualNext === next.id) {
      return p
    }
    const def = legPlan[i]
    return { ...p, legMode: def.legMode, travelMinToNext: def.travelMin, legManualNext: undefined }
  })
}
```

- [ ] **Step 4: 跑測試** — `npx jest leg-merge --silent` PASS（4 tests）。

- [ ] **Step 5: Commit**
```bash
git add lib/utils/legMerge.ts __tests__/leg-merge.test.ts
git commit -m "feat: legMerge — preserve manual leg modes across structural changes"
```

---

## Task 4: 建立行程後置步驟 `applyLegDefaults` + 接上 plan.ts

**Files:** Modify `app/actions/legs.ts`, `app/actions/plan.ts`; Test `__tests__/apply-leg-defaults.test.ts`

**Interfaces — Consumes:** `computeLegPlan`（Task 2）；`recalcDay`（`@/lib/utils/clientScheduler`，#7 已 export）；`dayDate`（`@/lib/utils/date`）。
**Produces:** `applyLegDefaults(days: DayItinerary[], startDate: string): Promise<DayItinerary[]>`

- [ ] **Step 1: 失敗測試** — Create `__tests__/apply-leg-defaults.test.ts`:
```ts
import { applyLegDefaults } from '@/app/actions/legs'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

// 只 mock 距離矩陣，讓真實 computeLegPlan 在 applyLegDefaults 內跑（避免攔不到同檔內部呼叫）。
// 所有站同座標 (0,0) → haversine 0m ≤500 → 走步行；步行 300s = 5 分。
jest.mock('@/app/actions/directions', () => ({
  buildDistanceMatrix: jest.fn(async (places: { placeId: string }[], mode: 'driving' | 'walking' | 'transit') => ({
    indices: places.map((p) => p.placeId),
    matrix: places.map(() => places.map(() => ({ driving: 600, walking: 300, transit: 900 }[mode]))),
  })),
}))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 99, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function day(places: ScheduledPlace[]): DayItinerary {
  return { day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}

it('assigns legMode + travelMinToNext per leg and nulls the last', async () => {
  const out = await applyLegDefaults([day([sp('A'), sp('B'), sp('C')])], '2026-07-01')
  const places = out[0].places
  expect(places[0].legMode).toBe('walking')  // 0m ≤500 → walking
  expect(places[0].travelMinToNext).toBe(5)  // 300s
  expect(places[1].travelMinToNext).toBe(5)
  expect(places[2].legMode).toBeUndefined()
  expect(places[2].travelMinToNext).toBeNull()
})
it('re-times the day from its travel (start times reflect 5-min legs)', async () => {
  const out = await applyLegDefaults([day([sp('A'), sp('B')])], '2026-07-01')
  // A 09:00 (60min) + 5 travel → B at 10:05
  expect(out[0].places[0].startTime).toBe('09:00')
  expect(out[0].places[1].startTime).toBe('10:05')
})
```

> 註：只 mock `buildDistanceMatrix`，讓**真實**的 `computeLegPlan` 在 `applyLegDefaults` 內執行（jest 無法攔截同模組內部呼叫，故不 mock `computeLegPlan` 本身）。所有站同座標 → 距離 0m → 走步行分支，步行 300s=5 分。

- [ ] **Step 2: 跑確認失敗** — `npx jest apply-leg-defaults --silent` → FAIL（`applyLegDefaults` 不存在）。

- [ ] **Step 3: 實作 applyLegDefaults** — In `app/actions/legs.ts`，加 import 與函式：
```ts
import type { DayItinerary } from '@/lib/types'
import { recalcDay } from '@/lib/utils/clientScheduler'
import { dayDate } from '@/lib/utils/date'
```
```ts
export async function applyLegDefaults(
  days: DayItinerary[],
  startDate: string
): Promise<DayItinerary[]> {
  return Promise.all(
    days.map(async (day) => {
      const legPlan = await computeLegPlan(day.places)
      const places = day.places.map((p, i) =>
        i < day.places.length - 1
          ? { ...p, legMode: legPlan[i].legMode, travelMinToNext: legPlan[i].travelMin }
          : { ...p, legMode: undefined, travelMinToNext: null }
      )
      return recalcDay({ ...day, places }, dayDate(startDate, day.day))
    })
  )
}
```
> `recalcDay` 是純函式（`lib/utils/clientScheduler.ts`，無 `'use client'`），可於伺服器動作匯入。

- [ ] **Step 4: 接上 plan.ts** — In `app/actions/plan.ts`：
  - import 加 `applyLegDefaults`：`import { schedulePlaces } from './schedule'` 下一行加 `import { applyLegDefaults } from './legs'`。
  - 把 line 29-31 改為：
    ```ts
    const dayItineraries = await schedulePlaces(ordered, matrix, days, startDate)
    const withLegs = await applyLegDefaults(dayItineraries, startDate)
    const enrichedDays = await generateDaySummaries(withLegs)
    ```

- [ ] **Step 5: 跑測試 + build** — `npx jest apply-leg-defaults --silent` PASS（2 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 6: Commit**
```bash
git add app/actions/legs.ts app/actions/plan.ts __tests__/apply-leg-defaults.test.ts
git commit -m "feat: applyLegDefaults post-step assigns per-segment modes at plan build"
```

---

## Task 5: `ItineraryCard` 每段工具圖示 + 時間 + 下拉

**Files:** Modify `components/ItineraryCard.tsx`; Test `__tests__/itinerary-card-leg.test.tsx`

**Interfaces — Produces:** `ItineraryCard` 新 props `onChangeLegMode?: (placeId: string, mode: TransportMode) => void`、`legBusy?: boolean`。

- [ ] **Step 1: 失敗測試** — Create `__tests__/itinerary-card-leg.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 18, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, legMode: 'driving', ...over }
}

it('shows the leg mode label + minutes', () => {
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-01" />)
  expect(screen.getByText(/開車 18 分/)).toBeInTheDocument()
})
it('changing the mode dropdown calls onChangeLegMode', () => {
  const onChangeLegMode = jest.fn()
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-01" onChangeLegMode={onChangeLegMode} />)
  fireEvent.change(screen.getByLabelText('交通工具'), { target: { value: 'transit' } })
  expect(onChangeLegMode).toHaveBeenCalledWith('A', 'transit')
})
it('shows 計算中… while legBusy', () => {
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-01" onChangeLegMode={() => {}} legBusy />)
  expect(screen.getByText('計算中…')).toBeInTheDocument()
})
it('renders no leg row for the last place (travelMinToNext null)', () => {
  render(<ItineraryCard place={sp({ travelMinToNext: null, legMode: undefined })} index={0} dateIso="2026-07-01" />)
  expect(screen.queryByText(/分$/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest itinerary-card-leg --silent` → FAIL。

- [ ] **Step 3: 實作** — In `components/ItineraryCard.tsx`：
  - import 型別加 `TransportMode`：把 line 8 改為 `import type { PlaceType, ScheduledPlace, TransportMode } from '@/lib/types'`。
  - Props interface（line 11-20）加：
    ```ts
    onChangeLegMode?: (placeId: string, mode: TransportMode) => void
    legBusy?: boolean
    ```
  - 解構（line 22）加 `onChangeLegMode, legBusy`。
  - 在 component 函式內、`return` 之前加常數：
    ```ts
    const LEG_META: Record<TransportMode, { icon: string; label: string }> = {
      driving: { icon: '🚗', label: '開車' },
      walking: { icon: '🚶', label: '步行' },
      transit: { icon: '🚇', label: '大眾運輸' },
    }
    ```
  - 把現有交通列（line 136-138）整段換成：
    ```tsx
    {place.travelMinToNext !== null && (
      <div className="text-xs text-gray-400 mt-3 pl-10 flex items-center gap-2 flex-wrap">
        <span>
          &#x2192; {LEG_META[place.legMode ?? 'driving'].icon} {LEG_META[place.legMode ?? 'driving'].label} {place.travelMinToNext} 分
        </span>
        {onChangeLegMode && (
          legBusy ? (
            <span className="text-gray-400">計算中…</span>
          ) : (
            <select
              aria-label="交通工具"
              value={place.legMode ?? 'driving'}
              onChange={(e) => onChangeLegMode(place.id, e.target.value as TransportMode)}
              className="border border-gray-200 rounded px-1 py-0.5 text-xs"
            >
              <option value="driving">開車</option>
              <option value="walking">步行</option>
              <option value="transit">大眾運輸</option>
            </select>
          )
        )}
      </div>
    )}
    ```

- [ ] **Step 4: 跑測試 + build** — `npx jest itinerary-card-leg --silent` PASS（4 tests）；`npx jest --silent` 全綠（既有 card 測試：交通列改為 `!== null` 顯示，確認既有 fixture 的 `travelMinToNext` 仍符合預期；若有既有測試斷言舊文案「前往下一站約」，更新為新文案）；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add components/ItineraryCard.tsx __tests__/itinerary-card-leg.test.tsx
git commit -m "feat: per-segment transport mode + time + dropdown on ItineraryCard"
```

---

## Task 6: `ItineraryClient` 串接 + `ItineraryDay` 透傳

**Files:** Modify `app/itinerary/ItineraryClient.tsx`, `components/ItineraryDay.tsx`; Test `__tests__/itinerary-client-leg.test.tsx`

**Interfaces — Consumes:** `legDuration`、`computeLegPlan`（Task 2）；`legMerge`（Task 3）；`recalcPlan`（既有）。
**Produces:** `ItineraryDay` 新 props `onChangeLegMode?: (placeId, mode) => void`、`legBusyPlaceId?: string | null`（透傳給每張 Card）。

- [ ] **Step 1: 失敗測試** — Create `__tests__/itinerary-client-leg.test.tsx`:

> **務必先複製** `__tests__/itinerary-client-smart-arrange.test.tsx` 頂部用來讓 `ItineraryClient` 能在 jsdom 渲染的所有 mock（dnd-kit、`CombinedInput`、`RecommendPanel` 等），否則元件渲染就會失敗。下面只列出本測試額外需要的 `@/app/actions/legs` mock 與測試本體；把它們與既有那組 mock 合併在同一檔。

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

// ⬇️ 連同 itinerary-client-smart-arrange.test.tsx 的 dnd-kit/CombinedInput/RecommendPanel mocks 一起放
const legDuration = jest.fn()
jest.mock('@/app/actions/legs', () => ({
  legDuration: (...a: unknown[]) => legDuration(...a),
  computeLegPlan: jest.fn(async () => []),
}))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 18, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, legMode: 'driving', ...over }
}
function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [sp('A'), sp('B', { travelMinToNext: null, legMode: undefined })],
      aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving', startDate: '2026-07-01',
  }
}

beforeEach(() => { legDuration.mockReset() })

it('changing a leg mode calls legDuration and updates the leg', async () => {
  legDuration.mockResolvedValue(25)
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getAllByLabelText('交通工具')[0], { target: { value: 'transit' } })
  await waitFor(() => expect(screen.getByText(/大眾運輸 25 分/)).toBeInTheDocument())
  expect(legDuration).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'A' }), expect.objectContaining({ id: 'B' }), 'transit'
  )
})

it('shows an error and keeps the leg when legDuration rejects', async () => {
  legDuration.mockRejectedValue(new Error('boom'))
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getAllByLabelText('交通工具')[0], { target: { value: 'walking' } })
  await waitFor(() => expect(screen.getByText('交通時間計算失敗')).toBeInTheDocument())
  expect(screen.getByText(/開車 18 分/)).toBeInTheDocument()
})
```

> 註：結構改變的 2 秒 leg 重算（`computeLegPlan` + `legMerge`）以 Task 2/3 的單元測試覆蓋核心；此處整合測試聚焦手動改段（即時路徑）與錯誤處理，避免 fake-timer 脆弱性。實作仍須完成結構重算（Step 4）。

- [ ] **Step 2: 跑確認失敗** — `npx jest itinerary-client-leg --silent` → FAIL。

- [ ] **Step 3: ItineraryDay 透傳** — In `components/ItineraryDay.tsx`：
  - import 型別加 `TransportMode`（line 6 已有 `TransportMode`，確認；若無則補）。
  - Props interface 加：
    ```ts
    onChangeLegMode?: (placeId: string, mode: TransportMode) => void
    legBusyPlaceId?: string | null
    ```
  - 解構加 `onChangeLegMode, legBusyPlaceId`。
  - `<ItineraryCard ... />`（map 內）加兩個 prop：
    ```tsx
    onChangeLegMode={onChangeLegMode}
    legBusy={legBusyPlaceId === place.id}
    ```

- [ ] **Step 4: ItineraryClient — import/state/handlers** — In `app/itinerary/ItineraryClient.tsx`：
  - import 加：
    ```ts
    import { legDuration, computeLegPlan } from '@/app/actions/legs'
    import { legMerge } from '@/lib/utils/legMerge'
    import type { TransportMode } from '@/lib/types'
    ```
    （`TransportMode` 若 line 17 的型別 import 未含，補上。）
  - state 加：
    ```ts
    const [legBusy, setLegBusy] = useState<{ dayIdx: number; placeId: string } | null>(null)
    const [legError, setLegError] = useState<string | null>(null)
    ```
  - 把既有 `scheduleRecalc`（2 秒 debounce）改為可選結構重算：
    ```ts
    const scheduleRecalc = useCallback((nextPlan: PlanResult, structural = false) => {
      planRef.current = nextPlan
      setPlan(nextPlan)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        let p = planRef.current
        if (structural) {
          try {
            const days = await Promise.all(
              p.days.map(async (d) => ({ ...d, places: legMerge(d.places, await computeLegPlan(d.places)) }))
            )
            p = { ...p, days }
          } catch {
            setLegError('交通時間計算失敗')
          }
        }
        const recalced = recalcPlan(p)
        planRef.current = recalced
        setPlan(recalced)
      }, 2000)
    }, [])
    ```
  - 加手動改段 handler：
    ```ts
    const handleChangeLegMode = useCallback(async (dayIdx: number, placeId: string, mode: TransportMode) => {
      const day = planRef.current.days[dayIdx]
      const idx = day.places.findIndex((p) => p.id === placeId)
      const next = day.places[idx + 1]
      if (!next) return
      setLegError(null)
      setLegBusy({ dayIdx, placeId })
      try {
        const min = await legDuration(day.places[idx], next, mode)
        const newDays = planRef.current.days.map((d, i) =>
          i !== dayIdx ? d : {
            ...d,
            places: d.places.map((p) =>
              p.id === placeId ? { ...p, legMode: mode, travelMinToNext: min, legManualNext: next.id } : p
            ),
          }
        )
        const recalced = recalcPlan({ ...planRef.current, days: newDays })
        planRef.current = recalced
        setPlan(recalced)
      } catch {
        setLegError('交通時間計算失敗')
      } finally {
        setLegBusy(null)
      }
    }, [])
    ```

- [ ] **Step 5: ItineraryClient — 結構觸發 + props + 錯誤訊息** — In `app/itinerary/ItineraryClient.tsx`：
  - 結構改變的呼叫點傳 `structural=true`：把拖曳結束 `handleDragEnd` 內的 `scheduleRecalc(...)` 呼叫、`handleSmartArrange` 成功後、新增/刪除地點/天的 recalc 呼叫，改為傳 `true`（例：`scheduleRecalc(nextPlan, true)`）。純時間/鎖編輯（`handleTimeChange` 等）維持不傳（預設 false）。
    > `handleSmartArrange`（#7）目前直接 `recalcPlan` 後 setPlan（即時重算時間）——**保留**這段，僅在其後**額外**呼叫 `scheduleRecalc(recalced, true)`，讓重排後 2 秒再重算每段交通（即時順序/時間不變，交通延後 2 秒精算）。
  - 每個 `<ItineraryDay>` 加兩個 prop：
    ```tsx
    onChangeLegMode={(placeId, mode) => handleChangeLegMode(dayIdx, placeId, mode)}
    legBusyPlaceId={legBusy?.dayIdx === dayIdx ? legBusy.placeId : null}
    ```
  - 在既有 `arrangeError` 訊息附近渲染 leg 錯誤：
    ```tsx
    {legError && <p className="text-sm text-red-600 mb-4" role="alert">{legError}</p>}
    ```

- [ ] **Step 6: 跑測試 + build** — `npx jest itinerary-client-leg --silent` PASS（2 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 7: Commit**
```bash
git add app/itinerary/ItineraryClient.tsx components/ItineraryDay.tsx __tests__/itinerary-client-leg.test.tsx
git commit -m "feat: wire per-segment transport — manual change + 2s structural leg recompute"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §2 規則 → Task1 `pickLegDefault`；§3 資料模型/`haversineMeters` → Task1；§4.1 伺服器動作 → Task2；§4.2 建立整合 → Task4；§4.3 客戶端手動改段 → Task6；§5 結構重算 + 保留手動 → Task3 `legMerge` + Task6 結構觸發；§6 UI → Task5；§7 錯誤 → Task5/Task6（保留原值 + 提示）；§9 測試 → 各 task。
- **與 spec 的偏離（已記錄）：** spec §4.2/§8 列「修改 `schedule.ts`」；本計畫改以 `plan.ts` 後置步驟 `applyLegDefaults`（Task 4）達成同樣「建立即帶 per-段預設」，**不動 `schedule.ts`**，避免動搖核心排程與其既有測試。觀察行為一致。
- **零破壞：** `legMode`/`legManualNext` 可選；`haversineSeconds` 純抽取行為不變；`schedule.ts` 不改。Task5 交通列由 `>0` 改 `!== null` 顯示——若有既有測試斷言舊文案需更新（已在 Task5 Step4 標註）。
- **型別一致：** `LegDefault`、`computeLegPlan`/`legDuration`/`applyLegDefaults`/`legMerge`/`pickLegDefault`、`legMode`/`legManualNext`、props（`onChangeLegMode`/`legBusy`/`legBusyPlaceId`）跨 task 命名一致。
- **不在範圍：** 路線排序與地圖嵌入（維持 plan 模式）；時段交通；拖曳當下同步查（一律 2 秒 debounce）。
