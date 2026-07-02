# 智慧排程（每天獨立重排）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每天標頭一顆「智慧排程」按鈕 + 兩個勾選框（避開壅塞 / 避開人潮），按下後只重排那一天未鎖定地點的順序，使「移動時間 + 人潮等待」總成本最低，鎖定地點當錨點不動。

**Architecture:** 純函式 `lib/utils/arrangeDay.ts` 做成本模型 + 決定性局部搜尋；評分時直接重用既有 `recalcDay`（改為 export）來算各候選順序的時序（時序邏輯維持單一來源，不另抽 `simulateTimes`）。薄伺服器動作 `app/actions/arrange.ts` 只負責取距離矩陣（重用 `buildDistanceMatrix`）與選擇性的人潮預測（重用 `getCrowdForecast`）。UI 在 `ItineraryDay` 加控制項、`ItineraryClient` 加 handler / loading / 錯誤處理。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Jest + Testing Library (jsdom)。

## Global Constraints

- TypeScript strict，無 `any`。不新增 npm 套件（crowd 層、距離矩陣、TSP 皆既有）。
- UI 文案繁體中文。
- 新欄位皆**可選** + 讀取端 `?? true` → 零 fixture 遷移。
- 決定性排程：無 `Math.random` / `Date.now`，同輸入同輸出。
- 既有全測試需保持綠（特別是 `recalcDay` 行為不可改變——只加 `export`）。
- 只重排「那一天」；不跨天搬移、不改停留時長、不壓縮空閒時間。
- 懲罰常數：`{ low: 0, medium: 600, high: 1800 }`（秒）；只勾人潮時 `wTravel = 0.2`。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/types.ts`（改） | `DayItinerary.avoidTraffic?/avoidCrowds?`；新 `DayArrangeInputs`/`ArrangeOpts` |
| `lib/utils/clientScheduler.ts`（改） | 把 `recalcDay` 由區域函式改為 `export`（行為不變） |
| `lib/utils/arrangeDay.ts`（新） | 成本模型 + 懲罰常數 + `arrangeDayOrder` 局部搜尋（純） |
| `app/actions/arrange.ts`（新） | `fetchDayArrangeInputs`：取距離矩陣 + 選擇性 crowd |
| `components/ItineraryDay.tsx`（改） | 兩 checkbox + 智慧排程按鈕（disabled/loading） |
| `app/itinerary/ItineraryClient.tsx`（改） | `handleSmartArrange`、`handleSetAvoid`、loading state、錯誤訊息 |

---

## Task 1: 資料模型 + `arrangeDay.ts` 純核心

**Files:**
- Modify: `lib/types.ts`（`DayItinerary` 末尾加兩可選欄位；新增 `DayArrangeInputs`/`ArrangeOpts`）
- Modify: `lib/utils/clientScheduler.ts:42`（`function recalcDay` → `export function recalcDay`）
- Create: `lib/utils/arrangeDay.ts`
- Test: `__tests__/arrangeDay.test.ts`

**Interfaces — Consumes:** `recalcDay(day: DayItinerary, dateIso: string): DayItinerary`（clientScheduler，本任務改為 export）；`levelAt(forecast, day, hour)`（`@/lib/crowd`，day 0=Mon..6=Sun）；`weekdayIndex(iso): number`（`@/lib/utils/date`，0=Mon..6=Sun）。
**Produces:**
- `interface DayArrangeInputs { indices: string[]; matrix: number[][]; crowdByPlaceId: Record<string, CrowdForecast> }`
- `interface ArrangeOpts { avoidTraffic: boolean; avoidCrowds: boolean }`
- `arrangeDayOrder(day: DayItinerary, dateIso: string, inputs: DayArrangeInputs, opts: ArrangeOpts): ScheduledPlace[]`（回傳重排後、travelMinToNext 已依新相鄰刷新、但時間尚未重算的當天 places）

- [ ] **Step 1: 型別** — In `lib/types.ts`：
  - `DayItinerary`（line 30-36）的 `dayEnd` 後加兩行（注意 `dayEnd` 那行補逗號）：
    ```ts
    avoidTraffic?: boolean    // 智慧排程：避開壅塞，讀取時 ?? true
    avoidCrowds?: boolean     // 智慧排程：避開人潮，讀取時 ?? true
    ```
  - 檔案末端加（`CrowdForecast` 以 type-only import）：
    ```ts
    import type { CrowdForecast } from '@/lib/crowd/types'

    export interface DayArrangeInputs {
      indices: string[]                              // placeId → 矩陣列
      matrix: number[][]                             // 秒
      crowdByPlaceId: Record<string, CrowdForecast>  // 僅含成功取得者
    }

    export interface ArrangeOpts {
      avoidTraffic: boolean
      avoidCrowds: boolean
    }
    ```
    > 若 `lib/types.ts` 慣例是 import 放檔頭，把該 `import type` 移到檔頭其他 import 旁。

- [ ] **Step 2: export recalcDay** — In `lib/utils/clientScheduler.ts:42`，把 `function recalcDay(day: DayItinerary, dateIso: string): DayItinerary {` 改成 `export function recalcDay(day: DayItinerary, dateIso: string): DayItinerary {`。其餘不動（`recalcPlan` 仍照舊呼叫它）。

- [ ] **Step 3: 失敗測試** — Create `__tests__/arrangeDay.test.ts`：
```ts
import { arrangeDayOrder } from '@/lib/utils/arrangeDay'
import type { DayItinerary, ScheduledPlace, DayArrangeInputs } from '@/lib/types'
import type { CrowdForecast } from '@/lib/crowd/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

const A = sp('A'), B = sp('B'), C = sp('C')
const day: DayItinerary = { day: 1, places: [A, B, C], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
// 2026-07-04 是星期六 → weekdayIndex = 5
const dateIso = '2026-07-04'

// 對稱距離矩陣（秒）：A-B 20分, A-C 40分, B-C 20分
const M = [
  [0, 1200, 2400],
  [1200, 0, 1200],
  [2400, 1200, 0],
]
// B 在星期六 10 點 high、13 點 low；A/C 無資料
function bCrowd(): CrowdForecast {
  const weekly: (number | null)[][] = Array.from({ length: 7 }, () => Array<number | null>(24).fill(0))
  weekly[5][10] = 80   // high
  weekly[5][13] = 10   // low
  return { source: 'heuristic', weekly, fetchedAt: '2026-07-01T00:00:00Z' }
}
const inputsNoCrowd: DayArrangeInputs = { indices: ['A', 'B', 'C'], matrix: M, crowdByPlaceId: {} }
const inputsCrowd: DayArrangeInputs = { indices: ['A', 'B', 'C'], matrix: M, crowdByPlaceId: { B: bCrowd() } }

function names(places: ScheduledPlace[]): string[] {
  return places.map((p) => p.name)
}

it('avoidTraffic only → shortest route order A,B,C', () => {
  const out = arrangeDayOrder(day, dateIso, inputsNoCrowd, { avoidTraffic: true, avoidCrowds: false })
  expect(names(out)).toEqual(['A', 'B', 'C'])
})

it('avoidCrowds only → reorders so B avoids its 10:00 peak (B at 09:00 → B,A,C)', () => {
  // 決定性首改善 2-opt 從現有順序 [A,B,C] 出發；把 B 移到首站（09:00，低於 10:00 尖峰）即達最低成本 → [B,A,C]
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: false, avoidCrowds: true })
  expect(names(out)).toEqual(['B', 'A', 'C'])
})

it('both → reorders to skip B peak (B,A,C)', () => {
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  expect(names(out)).toEqual(['B', 'A', 'C'])
})

it('refreshes travelMinToNext to match the new adjacency (last = null)', () => {
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  // B,A,C → B→A 20min, A→C 40min, C last → null
  expect(out[0].travelMinToNext).toBe(20)
  expect(out[1].travelMinToNext).toBe(40)
  expect(out[2].travelMinToNext).toBeNull()
})

it('keeps a startLocked place at its original index', () => {
  const lockedDay: DayItinerary = { ...day, places: [A, { ...B, startLocked: true, startTime: '10:30' }, C] }
  const out = arrangeDayOrder(lockedDay, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  expect(out[1].name).toBe('B')           // B fixed at index 1
  expect(out[1].startLocked).toBe(true)
})

it('is deterministic (same input → same output)', () => {
  const a = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  const b = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  expect(names(a)).toEqual(names(b))
})

it('no-op when both options are off (order unchanged, travel still refreshed)', () => {
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: false, avoidCrowds: false })
  expect(names(out)).toEqual(['A', 'B', 'C'])
})
```

- [ ] **Step 4: 跑確認失敗** — `npx jest arrangeDay --silent` → FAIL（模組不存在）。

- [ ] **Step 5: 實作** — Create `lib/utils/arrangeDay.ts`：
```ts
import type { DayItinerary, ScheduledPlace, DayArrangeInputs, ArrangeOpts } from '@/lib/types'
import { recalcDay } from '@/lib/utils/clientScheduler'
import { levelAt } from '@/lib/crowd'
import { weekdayIndex } from '@/lib/utils/date'

const CROWD_PENALTY: Record<'low' | 'medium' | 'high', number> = { low: 0, medium: 600, high: 1800 }
const W_TRAVEL_WHEN_CROWD_ONLY = 0.2

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function travelSecs(aId: string, bId: string, inputs: DayArrangeInputs): number {
  const i = inputs.indices.indexOf(aId)
  const j = inputs.indices.indexOf(bId)
  if (i === -1 || j === -1) return 0
  return inputs.matrix[i][j]
}

function withRefreshedTravel(order: ScheduledPlace[], inputs: DayArrangeInputs): ScheduledPlace[] {
  return order.map((p, i) => ({
    ...p,
    travelMinToNext:
      i < order.length - 1 ? Math.round(travelSecs(p.placeId, order[i + 1].placeId, inputs) / 60) : null,
  }))
}

function totalTravelSecs(order: ScheduledPlace[], inputs: DayArrangeInputs): number {
  let s = 0
  for (let i = 0; i < order.length - 1; i++) s += travelSecs(order[i].placeId, order[i + 1].placeId, inputs)
  return s
}

function crowdPenalty(timed: ScheduledPlace[], inputs: DayArrangeInputs, weekday: number): number {
  let s = 0
  for (const p of timed) {
    const f = inputs.crowdByPlaceId[p.placeId]
    if (!f) continue
    const level = levelAt(f, weekday, Math.floor(toMin(p.startTime) / 60))
    if (level) s += CROWD_PENALTY[level]
  }
  return s
}

function cost(
  order: ScheduledPlace[],
  day: DayItinerary,
  dateIso: string,
  inputs: DayArrangeInputs,
  opts: ArrangeOpts
): number {
  const refreshed = withRefreshedTravel(order, inputs)
  // 時序以既有 recalcDay 計算（鎖定錨點、前後段排程的單一來源）
  const timedDay = recalcDay({ ...day, places: refreshed }, dateIso)
  const wTravel = opts.avoidTraffic ? 1.0 : opts.avoidCrowds ? W_TRAVEL_WHEN_CROWD_ONLY : 0
  const wCrowd = opts.avoidCrowds ? 1.0 : 0
  const travel = totalTravelSecs(order, inputs)
  const crowd = wCrowd ? crowdPenalty(timedDay.places, inputs, weekdayIndex(dateIso)) : 0
  return wTravel * travel + wCrowd * crowd
}

export function arrangeDayOrder(
  day: DayItinerary,
  dateIso: string,
  inputs: DayArrangeInputs,
  opts: ArrangeOpts
): ScheduledPlace[] {
  const places = day.places
  const unlocked = places.filter((p) => !p.startLocked)
  if (unlocked.length < 2 || (!opts.avoidTraffic && !opts.avoidCrowds)) {
    return withRefreshedTravel(places, inputs)
  }

  // 鎖定站固定於原索引；只在未鎖序列上做局部搜尋
  const lockedAt = new Map<number, ScheduledPlace>()
  places.forEach((p, i) => { if (p.startLocked) lockedAt.set(i, p) })
  const reconstruct = (unlockedOrder: ScheduledPlace[]): ScheduledPlace[] => {
    const out: ScheduledPlace[] = []
    let u = 0
    for (let i = 0; i < places.length; i++) {
      const locked = lockedAt.get(i)
      out.push(locked ?? unlockedOrder[u++])
    }
    return out
  }

  let bestUnlocked = unlocked
  let bestCost = cost(reconstruct(bestUnlocked), day, dateIso, inputs, opts)

  // 2-opt：僅接受嚴格改善 → 決定性（平手保留先前順序）
  let improved = true
  while (improved) {
    improved = false
    for (let i = 0; i < bestUnlocked.length - 1; i++) {
      for (let j = i + 1; j < bestUnlocked.length; j++) {
        const cand = [
          ...bestUnlocked.slice(0, i),
          ...bestUnlocked.slice(i, j + 1).reverse(),
          ...bestUnlocked.slice(j + 1),
        ]
        const c = cost(reconstruct(cand), day, dateIso, inputs, opts)
        if (c < bestCost - 1e-9) {
          bestUnlocked = cand
          bestCost = c
          improved = true
        }
      }
    }
  }

  return withRefreshedTravel(reconstruct(bestUnlocked), inputs)
}
```

- [ ] **Step 6: 跑測試 + build** — `npx jest arrangeDay --silent` PASS（8 tests）；`npx jest --silent` 全綠（含既有 clientScheduler 測試，證明 recalcDay 行為不變）；`npm run build` 成功。

- [ ] **Step 7: Commit**
```bash
git add lib/types.ts lib/utils/clientScheduler.ts lib/utils/arrangeDay.ts __tests__/arrangeDay.test.ts
git commit -m "feat: arrangeDay cost model + deterministic per-day reorder (reuses recalcDay for timing)"
```

---

## Task 2: 伺服器動作 `fetchDayArrangeInputs`

**Files:** Create `app/actions/arrange.ts`; Test `__tests__/fetch-day-arrange-inputs.test.ts`

**Interfaces — Consumes:** `buildDistanceMatrix(places, mode): Promise<{indices, matrix}>`（`@/app/actions/directions`）；`getCrowdForecast(place): Promise<CrowdForecast>`（`@/lib/crowd`）；`DayArrangeInputs`（`@/lib/types`，Task 1）。
**Produces:** `fetchDayArrangeInputs(dayPlaces: Place[], mode: TransportMode, needCrowd: boolean): Promise<DayArrangeInputs>`

- [ ] **Step 1: 失敗測試** — Create `__tests__/fetch-day-arrange-inputs.test.ts`：
```ts
import { fetchDayArrangeInputs } from '@/app/actions/arrange'
import type { Place } from '@/lib/types'

jest.mock('@/app/actions/directions', () => ({
  buildDistanceMatrix: jest.fn(async (places: Place[]) => ({
    indices: places.map((p) => p.placeId),
    matrix: places.map(() => places.map(() => 600)),
  })),
}))

const getCrowdForecast = jest.fn(async (p: Place) => ({
  source: 'heuristic' as const,
  weekly: Array.from({ length: 7 }, () => Array<number | null>(24).fill(0)),
  fetchedAt: '2026-07-01T00:00:00Z',
  venueId: p.placeId,
}))
jest.mock('@/lib/crowd', () => ({
  getCrowdForecast: (p: Place) => getCrowdForecast(p),
}))

function p(name: string): Place {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null }
}

beforeEach(() => { getCrowdForecast.mockClear() })

it('returns the distance matrix and skips crowd when needCrowd is false', async () => {
  const out = await fetchDayArrangeInputs([p('A'), p('B')], 'driving', false)
  expect(out.indices).toEqual(['A', 'B'])
  expect(out.matrix).toEqual([[600, 600], [600, 600]])
  expect(out.crowdByPlaceId).toEqual({})
  expect(getCrowdForecast).not.toHaveBeenCalled()
})

it('fetches a crowd forecast per place when needCrowd is true', async () => {
  const out = await fetchDayArrangeInputs([p('A'), p('B')], 'driving', true)
  expect(Object.keys(out.crowdByPlaceId).sort()).toEqual(['A', 'B'])
  expect(getCrowdForecast).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest fetch-day-arrange-inputs --silent` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** — Create `app/actions/arrange.ts`：
```ts
'use server'
import type { Place, TransportMode, DayArrangeInputs } from '@/lib/types'
import type { CrowdForecast } from '@/lib/crowd/types'
import { buildDistanceMatrix } from '@/app/actions/directions'
import { getCrowdForecast } from '@/lib/crowd'

export async function fetchDayArrangeInputs(
  dayPlaces: Place[],
  mode: TransportMode,
  needCrowd: boolean
): Promise<DayArrangeInputs> {
  const dm = await buildDistanceMatrix(dayPlaces, mode)
  const crowdByPlaceId: Record<string, CrowdForecast> = {}
  if (needCrowd) {
    const forecasts = await Promise.all(dayPlaces.map((p) => getCrowdForecast(p)))
    dayPlaces.forEach((p, i) => { crowdByPlaceId[p.placeId] = forecasts[i] })
  }
  return { indices: dm.indices, matrix: dm.matrix, crowdByPlaceId }
}
```

- [ ] **Step 4: 跑測試 + build** — `npx jest fetch-day-arrange-inputs --silent` PASS；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add app/actions/arrange.ts __tests__/fetch-day-arrange-inputs.test.ts
git commit -m "feat: fetchDayArrangeInputs server action (distance matrix + optional crowd)"
```

---

## Task 3: `ItineraryDay` 控制項（兩 checkbox + 智慧排程按鈕）

**Files:** Modify `components/ItineraryDay.tsx`; Test `__tests__/itinerary-day-smart-arrange.test.tsx`

**Interfaces — Produces:** `ItineraryDay` 新 props：
- `onSmartArrange?: () => void`
- `onSetAvoid?: (field: 'avoidTraffic' | 'avoidCrowds', value: boolean) => void`
- `arranging?: boolean`

- [ ] **Step 1: 失敗測試** — Create `__tests__/itinerary-day-smart-arrange.test.tsx`：
```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function day(places: ScheduledPlace[], over: Partial<DayItinerary> = {}): DayItinerary {
  return { day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', ...over }
}
const base = {
  dayIdx: 0, mode: 'driving' as const, startDate: '2026-07-04',
}

it('renders both checkboxes checked by default (undefined → ?? true)', () => {
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect((screen.getByLabelText('避開壅塞') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('避開人潮') as HTMLInputElement).checked).toBe(true)
})

it('clicking 智慧排程 calls onSmartArrange', () => {
  const onSmartArrange = jest.fn()
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} onSmartArrange={onSmartArrange} onSetAvoid={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '智慧排程' }))
  expect(onSmartArrange).toHaveBeenCalledTimes(1)
})

it('toggling a checkbox calls onSetAvoid with the field and new value', () => {
  const onSetAvoid = jest.fn()
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} onSmartArrange={() => {}} onSetAvoid={onSetAvoid} />)
  fireEvent.click(screen.getByLabelText('避開壅塞'))
  expect(onSetAvoid).toHaveBeenCalledWith('avoidTraffic', false)
})

it('button is disabled when both options are off', () => {
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')], { avoidTraffic: false, avoidCrowds: false })}
    onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect(screen.getByRole('button', { name: '智慧排程' })).toBeDisabled()
})

it('button is disabled and shows 排程中… while arranging', () => {
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} arranging onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect(screen.getByRole('button', { name: '排程中…' })).toBeDisabled()
})

it('button is disabled when fewer than 2 unlocked places', () => {
  render(<ItineraryDay {...base} day={day([sp('A', { startLocked: true }), sp('B')])}
    onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect(screen.getByRole('button', { name: '智慧排程' })).toBeDisabled()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest itinerary-day-smart-arrange --silent` → FAIL。

- [ ] **Step 3: 實作** — In `components/ItineraryDay.tsx`：
  - Props interface（line 13-31）加三個：
    ```ts
    onSmartArrange?: () => void
    onSetAvoid?: (field: 'avoidTraffic' | 'avoidCrowds', value: boolean) => void
    arranging?: boolean
    ```
  - 解構（line 33）把 `onSmartArrange, onSetAvoid, arranging` 加入。
  - 在整天鎖按鈕區塊（line 74-102 的 IIFE）**之後**插入新區塊：
    ```tsx
    {(onSmartArrange || onSetAvoid) && (() => {
      const avoidTraffic = day.avoidTraffic ?? true
      const avoidCrowds = day.avoidCrowds ?? true
      const unlockedCount = day.places.filter((p) => !p.startLocked).length
      const disabled = !!arranging || unlockedCount < 2 || (!avoidTraffic && !avoidCrowds)
      return (
        <div className="flex items-center gap-3 mb-2 text-xs">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={avoidTraffic}
              onChange={(e) => onSetAvoid?.('avoidTraffic', e.target.checked)} />
            避開壅塞
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={avoidCrowds}
              onChange={(e) => onSetAvoid?.('avoidCrowds', e.target.checked)} />
            避開人潮
          </label>
          <button type="button" disabled={disabled} onClick={() => onSmartArrange?.()}
            title={(!avoidTraffic && !avoidCrowds) ? '請至少勾一項' : undefined}
            className="px-2 py-1 rounded-full border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">
            {arranging ? '排程中…' : '智慧排程'}
          </button>
        </div>
      )
    })()}
    ```
    > `<label>` 包住 `<input>` 與文字 → Testing Library 的 `getByLabelText('避開壅塞')` 能對到該 checkbox。

- [ ] **Step 4: 跑測試 + build** — `npx jest itinerary-day-smart-arrange --silent` PASS；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add components/ItineraryDay.tsx __tests__/itinerary-day-smart-arrange.test.tsx
git commit -m "feat: ItineraryDay smart-arrange controls (avoid-traffic/crowds checkboxes + button)"
```

---

## Task 4: `ItineraryClient` 串接（handler + loading + 錯誤）

**Files:** Modify `app/itinerary/ItineraryClient.tsx`; Test `__tests__/itinerary-client-smart-arrange.test.tsx`

**Interfaces — Consumes:** `fetchDayArrangeInputs`（Task 2）；`arrangeDayOrder`（Task 1）；`recalcPlan`（既有）；`dayDate`（既有）。

- [ ] **Step 1: 失敗測試** — Create `__tests__/itinerary-client-smart-arrange.test.tsx`：
```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

// 固定 inputs：A-B 20分, A-C 40分, B-C 20分；B 星期六 10 點 high、13 點 low
const fetchDayArrangeInputs = jest.fn()
jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: (...args: unknown[]) => fetchDayArrangeInputs(...args),
}))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [sp('A'), sp('B'), sp('C')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving', startDate: '2026-07-04',
  }
}
function crowdInputs() {
  const weekly: (number | null)[][] = Array.from({ length: 7 }, () => Array<number | null>(24).fill(0))
  weekly[5][10] = 80; weekly[5][13] = 10
  return {
    indices: ['A', 'B', 'C'],
    matrix: [[0, 1200, 2400], [1200, 0, 1200], [2400, 1200, 0]],
    crowdByPlaceId: { B: { source: 'heuristic', weekly, fetchedAt: '2026-07-01T00:00:00Z' } },
  }
}

beforeEach(() => { fetchDayArrangeInputs.mockReset() })

function dayOrder(): string[] {
  return screen.getAllByText(/^[ABC]$/).map((el) => el.textContent as string)
}

it('reorders the day on 智慧排程 (B,A,C to skip B peak) and calls the action with crowd=true', async () => {
  fetchDayArrangeInputs.mockResolvedValue(crowdInputs())
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '智慧排程' }))
  await waitFor(() => expect(dayOrder()).toEqual(['B', 'A', 'C']))
  expect(fetchDayArrangeInputs).toHaveBeenCalledWith(
    expect.any(Array), 'driving', true   // avoidCrowds default true
  )
})

it('shows an error and keeps order when the action rejects', async () => {
  fetchDayArrangeInputs.mockRejectedValue(new Error('boom'))
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '智慧排程' }))
  await waitFor(() => expect(screen.getByText('排程失敗，請稍後再試')).toBeInTheDocument())
  expect(dayOrder()).toEqual(['A', 'B', 'C'])
})

it('unchecking both options disables the button (no call)', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByLabelText('避開壅塞'))
  fireEvent.click(screen.getByLabelText('避開人潮'))
  expect(screen.getByRole('button', { name: '智慧排程' })).toBeDisabled()
})
```
> 註：`dayOrder()` 依賴卡片把地名渲染成單字節點。若實際 DOM 的地名節點查不到單字，改用 `screen.getByTestId('day-0')` 內 `data-testid="card-A"` 等卡片順序斷言（卡片 testid 為 `card-${place.id}`，見 `ItineraryCard`）。實作測試時以實際 DOM 為準調整這個 helper。

- [ ] **Step 2: 跑確認失敗** — `npx jest itinerary-client-smart-arrange --silent` → FAIL。

- [ ] **Step 3: import + state** — In `app/itinerary/ItineraryClient.tsx`：
  - 頂部 import 加：
    ```ts
    import { fetchDayArrangeInputs } from '@/app/actions/arrange'
    import { arrangeDayOrder } from '@/lib/utils/arrangeDay'
    ```
  - 在其他 `useState` 旁加：
    ```ts
    const [arrangingDay, setArrangingDay] = useState<number | null>(null)
    const [arrangeError, setArrangeError] = useState<string | null>(null)
    ```

- [ ] **Step 4: handlers** — 在其他 handler 旁加：
```ts
const handleSetAvoid = useCallback(
  (dayIdx: number, field: 'avoidTraffic' | 'avoidCrowds', value: boolean) => {
    const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, [field]: value } : d))
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  },
  []
)

const handleSmartArrange = useCallback(async (dayIdx: number) => {
  const current = planRef.current
  const day = current.days[dayIdx]
  setArrangeError(null)
  setArrangingDay(dayIdx)
  try {
    const inputs = await fetchDayArrangeInputs(
      day.places, current.transportMode, day.avoidCrowds ?? true
    )
    const reordered = arrangeDayOrder(
      day,
      dayDate(current.startDate, day.day),
      inputs,
      { avoidTraffic: day.avoidTraffic ?? true, avoidCrowds: day.avoidCrowds ?? true }
    )
    const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, places: reordered } : d))
    const recalced = recalcPlan({ ...planRef.current, days: newDays })
    planRef.current = recalced
    setPlan(recalced)
  } catch {
    setArrangeError('排程失敗，請稍後再試')
  } finally {
    setArrangingDay(null)
  }
}, [])
```

- [ ] **Step 5: 傳 props + 錯誤訊息** — In `app/itinerary/ItineraryClient.tsx`：
  - 每個 `<ItineraryDay>`（line 352-372）加三個 prop：
    ```tsx
    onSmartArrange={() => handleSmartArrange(dayIdx)}
    onSetAvoid={(field, value) => handleSetAvoid(dayIdx, field, value)}
    arranging={arrangingDay === dayIdx}
    ```
  - 在行程內容上方（例如 days 容器 `<div>` 之前）渲染錯誤訊息：
    ```tsx
    {arrangeError && (
      <p className="text-sm text-red-600 mb-4" role="alert">{arrangeError}</p>
    )}
    ```

- [ ] **Step 6: 跑測試 + build** — `npx jest itinerary-client-smart-arrange --silent` PASS；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 7: Commit**
```bash
git add app/itinerary/ItineraryClient.tsx __tests__/itinerary-client-smart-arrange.test.tsx
git commit -m "feat: wire smart-arrange into ItineraryClient (handler, loading, error)"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §2 行為 → Task3/4；§3.1 伺服器動作 → Task2；§3.2 純最佳化 → Task1（時序改重用 `recalcDay` 而非另抽 `simulateTimes`，達同一「單一時序來源」目的、風險更低，且 `recalcDay` 行為不變由既有測試保證）；§4 成本模型（懲罰 0/600/1800、wTravel 0.2、§4.4 權衡）→ Task1 測試；§5 資料模型（可選欄位、零遷移）→ Task1；§6 UI → Task3；§8 邊界（全鎖/無資料/重複點擊/決定性）→ Task1+Task3+Task4；§9 測試策略 → 各 task 測試。
- **與 spec 的唯一偏離：** spec §3.2 寫「抽出 `simulateTimes`」；本計畫改為「export 並重用 `recalcDay`」評分。理由：`recalcDay` 含多鎖前後段排程，忠實抽出 `simulateTimes` 風險高；重用它讓時序邏輯真正只有一份。觀察行為與 spec 一致。
- **零破壞：** 新欄位可選 + 讀取 `?? true`；`recalcDay` 只加 `export`；新檔不影響既有路徑。
- **型別一致：** `DayArrangeInputs`/`ArrangeOpts`、`arrangeDayOrder`、`fetchDayArrangeInputs`、新 props（`onSmartArrange`/`onSetAvoid`/`arranging`）跨 task 命名一致。
- **不在範圍：** 空閒區塊顯示（#6）、主動插入推薦、跨天最佳化、交通尖峰時段路由。
