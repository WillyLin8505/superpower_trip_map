# Lane C / C4 — 候選池依地理分到各天（帶箭頭加入）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 C3 候選池的地點依地理位置自動分到各天，每個候選像推薦卡一樣帶 `←` 箭頭顯示在它所屬那天下方，點箭頭加入該天並移出池（逐個、無全部接受、無觸發按鈕）。

**Architecture:** 全 client 衍生：`groupCandidatesByDay(plan.days, candidates)` 用既有 `findClosestDay` 分群 → 每個 `ItineraryDay` 收到 `candidates[dayIdx]` + `onAddCandidate` → 新 `DayCandidateSuggestions`（比照 `DayRecommendations`）渲染 `←` 卡 → 點擊沿用 C3 `handleAddCandidateToDay`（append + `scheduleRecalc(_,true)` + `removeCandidate`）。最後拿掉 C3 `CandidatePanel` 的手動 day-picker。

**Tech Stack:** Next.js 14 App Router、TypeScript strict、React、Jest + RTL。

**Spec:** `docs/superpowers/specs/2026-07-05-laneC-c4-candidate-arrange-design.md`

## Global Constraints

- TypeScript strict，無 production `any`（測試可用 typed mock / `unknown`）。
- 只 commit 在 `lane/c4-candidate-arrange`（疊在 main = C1+C2+C3）。
- 重用既有：`findClosestDay`（`lib/utils/geo.ts`）、`handleAddCandidateToDay`（C3，`ItineraryClient`）、`RecommendationCard` 的 `←` 視覺。
- 候選建議僅在**持久化模式**（`tripId` 有值）顯示；匿名 `/itinerary` 零影響。
- UI 文案繁體中文。候選卡沿用**目前推薦卡樣式**；DESIGN.md 溫暖旅誌待 itinerary 頁整體 rollout，不在本範圍。
- code-first：live Supabase 驗證延後（沿用 C1–C3）。
- C3 既有測試（candidates-actions / candidate-panel / itinerary-client-candidates / trip-page-candidates）保持綠。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `lib/utils/candidateArrange.ts`（新） | `groupCandidatesByDay` 純函式 |
| `components/DayCandidateSuggestions.tsx`（新，client） | 某天的候選建議清單 + `←` 加入鈕 |
| `components/ItineraryDay.tsx`（改） | 新增 `candidates`/`onAddCandidate` props + 渲染 `DayCandidateSuggestions` |
| `app/itinerary/ItineraryClient.tsx`（改） | `candidatesByDay` useMemo + 傳給各 `ItineraryDay`；後續移除 `CandidatePanel` day-picker 串接 |
| `components/CandidatePanel.tsx`（改） | 移除 day-picker `放進`（改由每天箭頭） |

---

## Task 1: `groupCandidatesByDay` 純函式

**Files:**
- Create: `lib/utils/candidateArrange.ts`
- Test: `__tests__/candidate-arrange.test.ts`

**Interfaces:**
- Consumes: `@/lib/utils/geo` `findClosestDay(days, place)`；`@/lib/types` `Candidate`/`DayItinerary`。
- Produces: `groupCandidatesByDay(days: DayItinerary[], candidates: Candidate[]): Candidate[][]`（長度恆等 `days.length`）。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/candidate-arrange.test.ts`:
```ts
import { groupCandidatesByDay } from '@/lib/utils/candidateArrange'
import type { Candidate, DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, lat: number, lng: number): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false }
}
function day(d: number, places: ScheduledPlace[]): DayItinerary {
  return { day: d, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
function cand(id: string, lat: number, lng: number): Candidate {
  return { id, addedBy: 'u', addedByName: 'X',
    place: { id, placeId: id, name: id, type: 'attraction', lat, lng, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null } }
}

it('assigns each candidate to the geographically nearest day', () => {
  const days = [day(1, [sp('east', 25.05, 121.60)]), day(2, [sp('west', 25.05, 121.50)])]
  const cands = [cand('c-east', 25.04, 121.61), cand('c-west', 25.06, 121.49)]
  const out = groupCandidatesByDay(days, cands)
  expect(out).toHaveLength(2)
  expect(out[0].map((c) => c.id)).toEqual(['c-east'])
  expect(out[1].map((c) => c.id)).toEqual(['c-west'])
})

it('round-robins by index when all days are empty (no anchors)', () => {
  const days = [day(1, []), day(2, []), day(3, [])]
  const cands = [cand('a', 0, 0), cand('b', 0, 0), cand('c', 0, 0), cand('d', 0, 0)]
  const out = groupCandidatesByDay(days, cands)
  expect(out[0].map((c) => c.id)).toEqual(['a', 'd'])
  expect(out[1].map((c) => c.id)).toEqual(['b'])
  expect(out[2].map((c) => c.id)).toEqual(['c'])
})

it('output length equals days.length; empty candidates → all empty buckets', () => {
  const days = [day(1, [sp('x', 0, 0)]), day(2, [])]
  expect(groupCandidatesByDay(days, [])).toEqual([[], []])
})

it('with some empty days, candidates attach to nearest non-empty day (empty day stays empty)', () => {
  const days = [day(1, [sp('anchor', 25.05, 121.60)]), day(2, [])]
  const out = groupCandidatesByDay(days, [cand('c', 25.04, 121.61)])
  expect(out[0].map((c) => c.id)).toEqual(['c'])
  expect(out[1]).toEqual([])
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- candidate-arrange`
Expected: FAIL（`Cannot find module '@/lib/utils/candidateArrange'`）。

- [ ] **Step 3: 實作純函式**

Create `lib/utils/candidateArrange.ts`:
```ts
import { findClosestDay } from './geo'
import type { Candidate, DayItinerary } from '@/lib/types'

// 依地理把候選池分到各天：有錨的天用 findClosestDay 就近吸附（空天回 Infinity 不會被選）；
// 若所有天皆空（無錨可比，findClosestDay 會全回 0），改用 round-robin 依索引分散，避免全擠第 0 天。
export function groupCandidatesByDay(days: DayItinerary[], candidates: Candidate[]): Candidate[][] {
  const buckets: Candidate[][] = days.map(() => [])
  if (days.length === 0) return buckets
  const hasAnchor = days.some((d) => d.places.length > 0)
  candidates.forEach((c, i) => {
    const idx = hasAnchor ? findClosestDay(days, c.place) : i % days.length
    buckets[idx].push(c)
  })
  return buckets
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest -- candidate-arrange`
Expected: PASS（4/4）。

- [ ] **Step 5: Commit**

```bash
git add lib/utils/candidateArrange.ts __tests__/candidate-arrange.test.ts
git commit -m "feat(laneC-c4): groupCandidatesByDay — geo-assign pool candidates to days (findClosestDay + round-robin fallback)"
```

---

## Task 2: `DayCandidateSuggestions` 元件

**Files:**
- Create: `components/DayCandidateSuggestions.tsx`
- Test: `__tests__/day-candidate-suggestions.test.tsx`

**Interfaces:**
- Consumes: `@/lib/types` `Candidate`/`Place`。
- Produces: `DayCandidateSuggestions({ candidates: Candidate[], onAdd: (candidateId: string, place: Place) => void })`；空清單 render `null`；每卡 `←` 鈕 `aria-label={`加入 ${place.name}`}`、`data-testid={`cand-add-${id}`}`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/day-candidate-suggestions.test.tsx`:
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayCandidateSuggestions } from '@/components/DayCandidateSuggestions'
import type { Candidate } from '@/lib/types'

function cand(id: string, name: string): Candidate {
  return { id, addedBy: 'u2', addedByName: '小明',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null } }
}

it('renders null when there are no candidates', () => {
  const { container } = render(<DayCandidateSuggestions candidates={[]} onAdd={() => {}} />)
  expect(container).toBeEmptyDOMElement()
})

it('lists each candidate with name and adder', () => {
  render(<DayCandidateSuggestions candidates={[cand('c1', '台北101')]} onAdd={() => {}} />)
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText(/小明/)).toBeInTheDocument()
})

it('clicking the ← arrow calls onAdd(candidateId, place)', () => {
  const onAdd = jest.fn()
  render(<DayCandidateSuggestions candidates={[cand('c1', '台北101')]} onAdd={onAdd} />)
  fireEvent.click(screen.getByRole('button', { name: '加入 台北101' }))
  expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({ name: '台北101' }))
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- day-candidate-suggestions`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作元件**

Create `components/DayCandidateSuggestions.tsx`:
```tsx
'use client'
import type { Candidate, Place } from '@/lib/types'

interface Props {
  candidates: Candidate[]
  onAdd: (candidateId: string, place: Place) => void
}

export function DayCandidateSuggestions({ candidates, onAdd }: Props) {
  if (candidates.length === 0) return null
  return (
    <div className="mt-3 border-t border-gray-200 pt-3" data-testid="day-candidate-suggestions">
      <p className="text-xs font-semibold text-gray-600 mb-2">候選池建議這一天</p>
      <div className="space-y-2">
        {candidates.map((c) => (
          <div key={c.id} className="border border-gray-200 rounded-xl p-3" data-testid={`cand-sugg-${c.id}`}>
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onAdd(c.id, c.place)}
                aria-label={`加入 ${c.place.name}`}
                data-testid={`cand-add-${c.id}`}
                className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center hover:bg-blue-700"
              >
                &#x2190;
              </button>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 text-sm">{c.place.name}</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">由 {c.addedByName} 加入</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest -- day-candidate-suggestions`
Expected: PASS（3/3）。

- [ ] **Step 5: Commit**

```bash
git add components/DayCandidateSuggestions.tsx __tests__/day-candidate-suggestions.test.tsx
git commit -m "feat(laneC-c4): DayCandidateSuggestions — per-day candidate cards with ← add arrow"
```

---

## Task 3: `ItineraryDay` + `ItineraryClient` 串接（衍生分群 + 每天渲染 + 點箭頭加入）

**Files:**
- Modify: `components/ItineraryDay.tsx`
- Modify: `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/itinerary-client-candidates.test.tsx`（擴充）

**Interfaces:**
- Consumes: `@/lib/utils/candidateArrange` `groupCandidatesByDay`；`@/components/DayCandidateSuggestions`；既有 C3 `handleAddCandidateToDay`。
- Produces: `ItineraryDay` 新增可選 `candidates?: Candidate[]` + `onAddCandidate?: (candidateId: string, place: Place) => void`；`ItineraryClient` 每天傳 `candidates={tripId ? candidatesByDay[dayIdx] : undefined}` + 綁定 `dayIdx` 的 `onAddCandidate`。
- 註：本 task **不動** `CandidatePanel`（day-picker `放進` 仍在，與新箭頭暫時並存），確保每個 commit 可編譯／`handleAddCandidateToDay` 持續被使用。Task 4 才移除舊 day-picker。

- [ ] **Step 1: 寫失敗測試（擴充 C3 整合測試）**

在 `__tests__/itinerary-client-candidates.test.tsx` 檔末（最後一個 `it(...)` 之後）追加：
```tsx
it('shows the pool candidate as a ← suggestion under its geographic day and accepts it on click', async () => {
  removeCandidate.mockResolvedValue(undefined)
  // plan() 的地點與 cand 皆在 lat/lng 0,0 → findClosestDay 指向 day 0
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[cand('c1', '台北101')]} />)
  // 候選以 ← 建議卡出現（DayCandidateSuggestions 的 add 鈕）
  const addBtn = await screen.findByTestId('cand-add-c1')
  fireEvent.click(addBtn)
  // 接受後：地點進 day 0、候選離池、removeCandidate 被呼叫
  expect(removeCandidate).toHaveBeenCalledWith('c1')
  expect(dayOrder()).toContain('c1')
  await waitFor(() => expect(screen.queryByTestId('cand-add-c1')).not.toBeInTheDocument())
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- itinerary-client-candidates`
Expected: FAIL（`cand-add-c1` 找不到——尚未渲染建議）。

- [ ] **Step 3: 改 `ItineraryDay`（props + 渲染）**

(a) 匯入：把 `components/ItineraryDay.tsx` line 9 的型別匯入補上 `Candidate, Place`，並在 line 7 之後匯入元件。

改：
```ts
import { DayRecommendations } from './DayRecommendations'
```
為：
```ts
import { DayRecommendations } from './DayRecommendations'
import { DayCandidateSuggestions } from './DayCandidateSuggestions'
```
改：
```ts
import type { DayItinerary, TransportMode, PlaceType, CategoryBuckets, DayRecommendation } from '@/lib/types'
```
為：
```ts
import type { DayItinerary, TransportMode, PlaceType, CategoryBuckets, DayRecommendation, Candidate, Place } from '@/lib/types'
```

(b) `Props` 追加（在 `onAddRecommendation` 那行之後）：
```ts
  onAddRecommendation?: (rec: DayRecommendation) => void
  candidates?: Candidate[]
  onAddCandidate?: (candidateId: string, place: Place) => void
```

(c) 解構參數追加（把 `recommendations, onAddRecommendation,` 改成含新兩個）：
```ts
export function ItineraryDay({ day, dayIdx, mode, startDate, isDragging, draggable, isOverflow, onScatter, onDelete, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType, onSetDayStartLock, onSetDayDurationLock, onChangeWindow, recommendations, onAddRecommendation, candidates, onAddCandidate, backfilling, isLastDay, onSmartArrange, onSetAvoid, arranging, onChangeLegMode, legBusyPlaceId }: Props) {
```

(d) 右欄渲染：把外層條件與內容改為也含候選建議。

改：
```tsx
        {(embedUrl || (recommendations && onAddRecommendation)) && (
          <div className="w-96 shrink-0 sticky top-4">
```
為：
```tsx
        {(embedUrl || (recommendations && onAddRecommendation) || (candidates && candidates.length > 0 && onAddCandidate)) && (
          <div className="w-96 shrink-0 sticky top-4">
```
並在 `DayRecommendations` 區塊（`)}` 收尾）之後、`</div>` 之前插入：
```tsx
            {candidates && onAddCandidate && (
              <DayCandidateSuggestions candidates={candidates} onAdd={onAddCandidate} />
            )}
```

- [ ] **Step 4: 改 `ItineraryClient`（分群 + 傳給各天）**

(a) 匯入 `useMemo` 與純函式。

改 line 2：
```ts
import { useState, useCallback, useRef, useEffect } from 'react'
```
為：
```ts
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
```
在 `import { addCandidate, removeCandidate } from '@/app/actions/candidates'` 之後加：
```ts
import { groupCandidatesByDay } from '@/lib/utils/candidateArrange'
```

(b) 在 C3 `handleAddCandidateToDay` 的 `useCallback` 之後，新增衍生分群：
```ts
  const candidatesByDay = useMemo(
    () => groupCandidatesByDay(plan.days, candidates),
    [plan.days, candidates]
  )
```

(c) 在渲染各天的 `<ItineraryDay ... />`，於 `onAddRecommendation={(rec) => handleAddRecommendation(dayIdx, rec)}` 這行之後插入兩個 props：
```tsx
                onAddRecommendation={(rec) => handleAddRecommendation(dayIdx, rec)}
                candidates={tripId ? candidatesByDay[dayIdx] : undefined}
                onAddCandidate={tripId ? (candidateId, place) => handleAddCandidateToDay(place, dayIdx, candidateId) : undefined}
```

- [ ] **Step 5: 跑測試確認通過 + 迴歸**

Run: `npx jest -- itinerary-client-candidates day-candidate-suggestions candidate-arrange`
Expected: 新整合測試 PASS；再跑完整 `npx jest`，C3 既有測試全綠。

- [ ] **Step 6: Commit**

```bash
git add components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx __tests__/itinerary-client-candidates.test.tsx
git commit -m "feat(laneC-c4): geo-distribute pool candidates to days as ← suggestions (ItineraryDay + ItineraryClient wiring)"
```

---

## Task 4: 移除 `CandidatePanel` day-picker（改由每天箭頭）+ 全量 gate

**Files:**
- Modify: `components/CandidatePanel.tsx`
- Modify: `app/itinerary/ItineraryClient.tsx`（`CandidatePanel` 呼叫端）
- Test: `__tests__/candidate-panel.test.tsx`（更新）

**Interfaces:**
- Produces: `CandidatePanel({ candidates, onAddPlace, onAddPlaces, onRemove })`（移除 `dayCount`、`onPromote`）。
- 註：本 task 移除舊 `onPromote` 串接後，`handleAddCandidateToDay` 仍被 Task 3 的 `onAddCandidate` 使用 → 無 unused 錯誤。

- [ ] **Step 1: 更新元件測試（先改測試反映新行為）**

編輯 `__tests__/candidate-panel.test.tsx`：把 render 的 props 從含 `dayCount`/`onPromote` 改為不含；移除「promote to a chosen day」那個 `it(...)`；新增一個「不再有放進按鈕」斷言。以此段取代原本的 promote 測試：
```tsx
it('no longer renders the day-picker promote control', () => {
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} />)
  expect(screen.queryByRole('button', { name: '放進' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/放進第幾天/)).not.toBeInTheDocument()
})
```
並把其餘 `it(...)` 內 `render(<CandidatePanel ... dayCount={2} ... onPromote={...} />)` 的 `dayCount`/`onPromote` 兩個 prop 一律刪除（保留 `candidates`/`onAddPlace`/`onAddPlaces`/`onRemove`）。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- candidate-panel`
Expected: FAIL（元件仍渲染 `放進`／型別仍要求 `onPromote`）。

- [ ] **Step 3: 改 `CandidatePanel`（移除 day-picker）**

以此整檔取代 `components/CandidatePanel.tsx`:
```tsx
'use client'
import type { Candidate, Place } from '@/lib/types'
import { CombinedInput } from '@/components/CombinedInput'

interface CandidatePanelProps {
  candidates: Candidate[]
  onAddPlace: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
  onRemove: (candidateId: string) => void
}

export function CandidatePanel({ candidates, onAddPlace, onAddPlaces, onRemove }: CandidatePanelProps) {
  return (
    <section className="border rounded-md p-4 flex flex-col gap-3">
      <h2 className="font-medium">候選池</h2>
      <CombinedInput onAdd={onAddPlace} onAddPlaces={onAddPlaces} />
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500">還沒有候選，搜尋想去的地方加進來吧</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1">
              <span className="flex-1">{c.place.name}<span className="text-gray-400 ml-2">由 {c.addedByName} 加入</span></span>
              <button onClick={() => onRemove(c.id)} className="text-red-600 hover:underline">移除</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: 改 `ItineraryClient` 呼叫端（移除 `dayCount`/`onPromote`）**

改：
```tsx
          <CandidatePanel
            candidates={candidates}
            dayCount={plan.days.length}
            onAddPlace={onAddCandidate}
            onAddPlaces={onAddCandidates}
            onRemove={onRemoveCandidate}
            onPromote={handleAddCandidateToDay}
          />
```
為：
```tsx
          <CandidatePanel
            candidates={candidates}
            onAddPlace={onAddCandidate}
            onAddPlaces={onAddCandidates}
            onRemove={onRemoveCandidate}
          />
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx jest -- candidate-panel`
Expected: PASS。

- [ ] **Step 6: 全量 gate**

Run（依序）:
```bash
npx jest && npm run lint && npm run build
```
Expected: 全綠、`next lint` clean、`next build` PASS（`@supabase/ssr` Edge `process.version` 警告為既知良性）。lint/build 若揪出 C4 真問題就地最小修。

- [ ] **Step 7: 更新 roadmap + ledger + Commit**

把 `docs/superpowers/specs/2026-07-01-laneC-roadmap.md` C4 列標為 **DONE**（branch `lane/c4-candidate-arrange`；code-first，live 待金鑰）；在 `.superpowers/sdd/progress.md` 追加 C4 ledger（各 task 完成 + gate 結果）。

```bash
git add components/CandidatePanel.tsx app/itinerary/ItineraryClient.tsx __tests__/candidate-panel.test.tsx docs/superpowers/specs/2026-07-01-laneC-roadmap.md .superpowers/sdd/progress.md
git commit -m "feat(laneC-c4): retire CandidatePanel day-picker (superseded by per-day ← arrows) + roadmap/ledger"
```

---

## Self-Review（對照 spec）

**Spec coverage:**
- §3 `groupCandidatesByDay`（findClosestDay + round-robin fallback + 空天不吸附）→ Task 1 ✅
- §4.1 `DayCandidateSuggestions`（空→null、`←`、`由 X 加入`）→ Task 2 ✅
- §4.2 `ItineraryDay` props + 渲染 → Task 3 ✅
- §4.4 `ItineraryClient` `candidatesByDay` + 逐天綁 `dayIdx` 呼叫既有 `handleAddCandidateToDay` → Task 3 ✅
- §4.3 `CandidatePanel` 移除 day-picker → Task 4 ✅
- §5 接受流程（沿用 C3 handleAddCandidateToDay，移動語義）→ Task 3 整合測試 ✅
- §6 匿名不顯示（`tripId` gate）→ Task 3（`candidates={tripId ? ... : undefined}`）+ C3 既有「anonymous 不顯示」測試 ✅
- §7 測試（純函式／元件／整合／panel／迴歸）→ Task 1–4 ✅

**Placeholder scan:** 無 TBD；每個 code step 含完整程式碼。

**Type consistency:** `groupCandidatesByDay(days, candidates): Candidate[][]`、`DayCandidateSuggestions.onAdd(candidateId, place)`、`ItineraryDay.onAddCandidate(candidateId, place)`、`handleAddCandidateToDay(place, dayIdx, candidateId)`（C3 既有簽名）跨 task 一致。`CandidatePanel` 移除 `dayCount`/`onPromote` 後，呼叫端同步更新（Task 4 Step 4）。
