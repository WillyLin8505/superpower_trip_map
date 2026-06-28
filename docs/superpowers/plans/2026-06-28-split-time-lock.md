# 拆分時間鎖（開始/停留）+ 整天全鎖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `ScheduledPlace.timeLocked` 拆成兩個獨立旗標 `startLocked`（鎖開始時間＝排程錨點＋不可拖）與 `durationLocked`（鎖停留時間），每張卡片兩個鎖按鈕，每天標頭兩個「整天全鎖」按鈕。

**Architecture:** Task 1 做資料模型遷移 + 排程錨點改判 `startLocked` + 卡片兩個鎖按鈕與「各自獨立」的時間顯示 + 兩個單項 handler，並遷移所有引用 `timeLocked` 的程式與測試（build 綠燈）。Task 2 在每天標頭加兩個「整天全鎖」切換（衍生狀態）+ 兩個整天 handler。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Jest + Testing Library (jsdom)。不新增 npm 套件。

## Global Constraints

- TypeScript strict，無 `any`。
- 不新增 npm 套件。
- UI 文案皆為繁體中文。
- 改鎖（任一種、單項或整天）一律**不觸發重排、不改 `startTime`/`durationMin`**（鏡像現有即時 `setPlan + planRef`）。
- `startLocked`：開始時間靜態、卡片不可拖（`useSortable` disabled + 隱藏 drag handle）、排程錨點。
- `durationLocked`：結束/停留時間靜態；仍可拖。
- 既有測試需全數通過（含已遷移的鎖測試）。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/types.ts` | `ScheduledPlace`：`timeLocked` → `startLocked` + `durationLocked` |
| `lib/utils/clientScheduler.ts` | 錨點判斷由 `timeLocked` 改 `startLocked`（line 45） |
| `app/actions/schedule.ts` | 初始排程兩鎖皆 false |
| `components/RecommendPanel.tsx` | 新增地點時兩鎖皆 false |
| `app/test-drag/page.tsx` | 測試頁 fixture 兩鎖皆 false |
| `components/ItineraryCard.tsx` | 兩個鎖按鈕、開始/停留各自靜態或 picker、拖曳綁 `startLocked` |
| `components/ItineraryDay.tsx` | 下傳兩個單項 callbacks（Task 1）；標頭兩個整天全鎖（Task 2） |
| `app/itinerary/ItineraryClient.tsx` | 兩個單項 handlers（Task 1）；兩個整天 handlers（Task 2） |
| 測試 | 遷移 `timeLocked` → 新欄位；新增兩鎖 + 整天全鎖測試 |

---

## Task 1: 拆分鎖資料模型 + 卡片兩個鎖按鈕（build 綠燈）

**Files:**
- Modify: `lib/types.ts:18-26`, `lib/utils/clientScheduler.ts:45`, `app/actions/schedule.ts`, `components/RecommendPanel.tsx`, `app/test-drag/page.tsx`, `components/ItineraryCard.tsx`, `components/ItineraryDay.tsx`, `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/client-scheduler.test.ts`, `__tests__/itinerary-card-info.test.tsx`, `__tests__/find-closest-day.test.ts`, `__tests__/drag-containers.test.ts`, `__tests__/map-url.test.ts`, `__tests__/itinerary-day-embed.test.tsx`, `__tests__/itinerary-change-type.test.tsx`, `__tests__/itinerary-card-type.test.tsx`, plus new `__tests__/split-lock-card.test.tsx`

**Interfaces:**
- Produces:
  - `ScheduledPlace.startLocked: boolean`, `ScheduledPlace.durationLocked: boolean`（取代 `timeLocked`）
  - `ItineraryCard` Props: `onToggleStartLock?: (placeId: string) => void`、`onToggleDurationLock?: (placeId: string) => void`（取代 `onToggleLock`）
  - `ItineraryClient`：`handleToggleStartLock(dayIdx, placeId)`、`handleToggleDurationLock(dayIdx, placeId)`（取代 `handleToggleLock`）

- [ ] **Step 1: 寫卡片新行為的失敗測試**

Create `__tests__/split-lock-card.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

const BASE: ScheduledPlace = {
  id: 'p1', placeId: 'g1', name: '淺草寺', type: 'attraction',
  lat: 0, lng: 0, address: '東京', openingHours: null, rating: null,
  photoUrl: null, description: null, startTime: '09:00', durationMin: 90,
  travelMinToNext: null, aiDescription: null, outsideHours: false,
  lateExit: false, startLocked: false, durationLocked: false,
}

it('renders two lock buttons (start + duration) when handlers provided', () => {
  render(
    <ItineraryCard place={BASE} index={0}
      onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} />
  )
  expect(screen.getByRole('button', { name: '鎖定開始時間' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '鎖定停留時間' })).toBeInTheDocument()
})

it('clicking start lock calls onToggleStartLock; duration lock calls onToggleDurationLock', () => {
  const onStart = jest.fn(); const onDur = jest.fn()
  render(<ItineraryCard place={BASE} index={0} onToggleStartLock={onStart} onToggleDurationLock={onDur} />)
  fireEvent.click(screen.getByRole('button', { name: '鎖定開始時間' }))
  fireEvent.click(screen.getByRole('button', { name: '鎖定停留時間' }))
  expect(onStart).toHaveBeenCalledWith('p1')
  expect(onDur).toHaveBeenCalledWith('p1')
})

it('startLocked → start time static (no start picker) and no drag handle', () => {
  render(
    <ItineraryCard place={{ ...BASE, startLocked: true }} index={0} draggable
      onTimeChange={jest.fn()} onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} />
  )
  // aria-label flips to 解鎖開始時間 when locked
  expect(screen.getByRole('button', { name: '解鎖開始時間' })).toBeInTheDocument()
  expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument()
  // start shown as static text 09:00 (no picker button for 09:00)
  expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
})

it('durationLocked → end time static but start still editable; card still draggable', () => {
  render(
    <ItineraryCard place={{ ...BASE, durationLocked: true }} index={0} draggable
      onTimeChange={jest.fn()} onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} />
  )
  expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  // start picker present (09:00 button), end is static (10:30 not a button)
  expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '10:30' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest split-lock-card --silent`
Expected: FAIL — `startLocked`/`durationLocked` 不存在於型別、卡片無雙鎖按鈕。

- [ ] **Step 3: 改型別**

In `lib/types.ts`, `ScheduledPlace`（line 18-26）把：
```typescript
  timeLocked: boolean       // recalc skips this place's startTime and durationMin
```
改為：
```typescript
  startLocked: boolean      // 鎖開始時間：排程錨點 + 不可拖
  durationLocked: boolean   // 鎖停留時間
```

- [ ] **Step 4: 排程錨點改判 startLocked**

In `lib/utils/clientScheduler.ts` line 45：
```typescript
  const lockIndices = places.reduce<number[]>((acc, p, i) => (p.timeLocked ? [...acc, i] : acc), [])
```
改為：
```typescript
  const lockIndices = places.reduce<number[]>((acc, p, i) => (p.startLocked ? [...acc, i] : acc), [])
```

- [ ] **Step 5: 初始排程 + 其他建構點兩鎖皆 false**

- `app/actions/schedule.ts`：把 `ScheduledPlace` 回傳物件中的 `timeLocked: false,` 改為 `startLocked: false,` 接一行 `durationLocked: false,`。
- `components/RecommendPanel.tsx`：新增地點建構 `ScheduledPlace` 的 `timeLocked: false,` 改為 `startLocked: false,` + `durationLocked: false,`。
- `app/test-drag/page.tsx`：fixture 物件的 `timeLocked: false` 改為 `startLocked: false, durationLocked: false`。

- [ ] **Step 6: 卡片兩個鎖按鈕 + 各自靜態時間 + 拖曳綁 startLocked**

In `components/ItineraryCard.tsx`：

(a) Props（line 15-21）改為：
```tsx
interface Props {
  place: ScheduledPlace
  index: number
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
}
```
解構同步改為 `{ place, index, draggable, onTimeChange, onToggleStartLock, onToggleDurationLock }`。

(b) `useSortable`（line 24-25）改為：
```tsx
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable || place.startLocked })
```

(c) drag handle（line 45-52）的條件改為 `draggable && !place.startLocked`：
```tsx
        {draggable && !place.startLocked && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-1 select-none"
            data-testid="drag-handle"
          >&#x2807;</span>
        )}
```

(d) 時間顯示區塊（現 line 66-94 的 `{place.timeLocked ? ... }` 整段）改為「開始」「結束」各自獨立：
```tsx
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {place.startLocked || !onTimeChange ? (
              <span className="text-sm text-gray-500">{place.startTime}</span>
            ) : (
              <TimeScrollPicker
                value={place.startTime}
                onChange={(v) => onTimeChange(place.id, 'startTime', v)}
              />
            )}
            <span className="text-gray-400 text-sm">→</span>
            {place.durationLocked || !onTimeChange ? (
              <span className="text-sm text-gray-500">{addMinutes(place.startTime, place.durationMin)}</span>
            ) : (
              <TimeScrollPicker
                value={addMinutes(place.startTime, place.durationMin)}
                onChange={(v) => {
                  const [eh, em] = v.split(':').map(Number)
                  const [sh, sm] = place.startTime.split(':').map(Number)
                  const rawDur = (eh * 60 + em) - (sh * 60 + sm)
                  const dur = rawDur > 0 ? rawDur : rawDur + 1440
                  if (dur > 0) onTimeChange(place.id, 'durationMin', dur)
                }}
              />
            )}
          </div>
```

(e) 鎖按鈕（現 line 108-117 的單一 `onToggleLock` 按鈕）改為兩個：
```tsx
        {(onToggleStartLock || onToggleDurationLock) && (
          <div className="flex flex-col gap-1 shrink-0 mt-0.5">
            {onToggleStartLock && (
              <button
                type="button"
                onClick={() => onToggleStartLock(place.id)}
                className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
                aria-label={place.startLocked ? '解鎖開始時間' : '鎖定開始時間'}
              >
                {place.startLocked ? '🔒' : '🔓'} 開始
              </button>
            )}
            {onToggleDurationLock && (
              <button
                type="button"
                onClick={() => onToggleDurationLock(place.id)}
                className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
                aria-label={place.durationLocked ? '解鎖停留時間' : '鎖定停留時間'}
              >
                {place.durationLocked ? '🔒' : '🔓'} 停留
              </button>
            )}
          </div>
        )}
```

- [ ] **Step 7: ItineraryDay 下傳兩個單項 callbacks**

In `components/ItineraryDay.tsx`：
- Props（line 7-15）把 `onToggleLock?: (placeId: string) => void` 改為：
  ```tsx
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  ```
- 解構（line 17）同步。
- `<ItineraryCard>`（line 31-38）把 `onToggleLock={onToggleLock}` 改為：
  ```tsx
              onToggleStartLock={onToggleStartLock}
              onToggleDurationLock={onToggleDurationLock}
  ```

- [ ] **Step 8: ItineraryClient 兩個單項 handlers**

In `app/itinerary/ItineraryClient.tsx`：
- 把 `handleToggleLock`（line 68-81）整段換成兩個 handler（鏡像原模式，即時 `setPlan + planRef`、不重排）：
```tsx
  const toggleLockField = useCallback((dayIdx: number, placeId: string, field: 'startLocked' | 'durationLocked') => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        places: d.places.map((p) =>
          p.id === placeId ? { ...p, [field]: !p[field] } : p
        ),
      }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleToggleStartLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'startLocked'),
    [toggleLockField]
  )
  const handleToggleDurationLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'durationLocked'),
    [toggleLockField]
  )
```
- `<ItineraryDay>`（line 216-226）把 `onToggleLock={(placeId) => handleToggleLock(dayIdx, placeId)}` 改為：
  ```tsx
                onToggleStartLock={(placeId) => handleToggleStartLock(dayIdx, placeId)}
                onToggleDurationLock={(placeId) => handleToggleDurationLock(dayIdx, placeId)}
  ```

- [ ] **Step 9: 遷移既有測試 fixtures（純機械改名）**

把下列檔案中的 `timeLocked: false`（或 `timeLocked: false,`）一律改為 `startLocked: false, durationLocked: false`：
- `__tests__/find-closest-day.test.ts:26`
- `__tests__/drag-containers.test.ts:11`
- `__tests__/map-url.test.ts:13`
- `__tests__/itinerary-day-embed.test.tsx:26`
- `__tests__/itinerary-change-type.test.tsx:113`
- `__tests__/itinerary-card-type.test.tsx:34`

- [ ] **Step 10: 遷移 client-scheduler 測試（錨點語意不變，改名）**

In `__tests__/client-scheduler.test.ts`：
- `makePlace` 預設（line 23）`timeLocked: false,` → `startLocked: false, durationLocked: false,`。
- 所有 `timeLocked: true` → `startLocked: true`（line 46, 55, 65, 81, 90, 96, 103, 105）。
- 所有其他 `timeLocked: false`（line 104）→ `startLocked: false`。
- 行為斷言不變（錨點＝startLocked，與原 timeLocked 等價）。

- [ ] **Step 11: 改寫 itinerary-card-info 的鎖測試**

In `__tests__/itinerary-card-info.test.tsx`：
- `BASE_PLACE`（line 47）`timeLocked: false,` → `startLocked: false, durationLocked: false,`。
- 把現有 4 個鎖測試（line 96-126：`renders lock button…`、`clicking lock button…`、`shows 解鎖時間 aria-label…`、`hides TimeScrollPickers…`）整段刪除（其行為已由 `__tests__/split-lock-card.test.tsx` 覆蓋），並把任何用到 `onToggleLock` 的 render 移除。

- [ ] **Step 12: 跑測試 + build**

Run: `npx jest split-lock-card --silent` → Expected: PASS（4 tests）。
Run: `npx jest --silent` → Expected: 全數通過。
Run: `npm run build` → Expected: 成功、無 TypeScript 錯誤（已無任何 `timeLocked` 引用）。

- [ ] **Step 13: Commit**

```bash
git add lib/types.ts lib/utils/clientScheduler.ts app/actions/schedule.ts components/RecommendPanel.tsx app/test-drag/page.tsx components/ItineraryCard.tsx components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx __tests__/split-lock-card.test.tsx __tests__/client-scheduler.test.ts __tests__/itinerary-card-info.test.tsx __tests__/find-closest-day.test.ts __tests__/drag-containers.test.ts __tests__/map-url.test.ts __tests__/itinerary-day-embed.test.tsx __tests__/itinerary-change-type.test.tsx __tests__/itinerary-card-type.test.tsx
git commit -m "feat: split timeLocked into startLocked + durationLocked with two per-card lock buttons"
```

---

## Task 2: 每天標頭兩個「整天全鎖」按鈕

**Files:**
- Modify: `components/ItineraryDay.tsx`, `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/day-lock-all.test.tsx`

**Interfaces:**
- Consumes: `ItineraryDay`（含 Task 1 的兩個單項 callbacks）。
- Produces:
  - `ItineraryDay` Props 新增 `onSetDayStartLock?: (locked: boolean) => void`、`onSetDayDurationLock?: (locked: boolean) => void`
  - `ItineraryClient`：`handleSetDayStartLock(dayIdx, locked)`、`handleSetDayDurationLock(dayIdx, locked)`

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/day-lock-all.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function place(id: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id, placeId: 'g'+id, name: id, type: 'attraction', lat: 0, lng: 0,
    address: 'a', openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}
const day = (places: ScheduledPlace[]): DayItinerary => ({ day: 1, places, aiSummary: null })

it('shows "整天鎖開始" as unlocked when not all start-locked, and locks all on click', () => {
  const onSet = jest.fn()
  render(<ItineraryDay day={day([place('a'), place('b')])} dayIdx={0} mode="driving"
    onSetDayStartLock={onSet} onSetDayDurationLock={jest.fn()} />)
  const btn = screen.getByRole('button', { name: /整天鎖開始/ })
  expect(btn.textContent).toContain('🔓')
  fireEvent.click(btn)
  expect(onSet).toHaveBeenCalledWith(true)
})

it('shows locked state when all places are start-locked, and unlocks all on click', () => {
  const onSet = jest.fn()
  render(<ItineraryDay day={day([place('a', { startLocked: true }), place('b', { startLocked: true })])}
    dayIdx={0} mode="driving" onSetDayStartLock={onSet} onSetDayDurationLock={jest.fn()} />)
  const btn = screen.getByRole('button', { name: /整天鎖開始/ })
  expect(btn.textContent).toContain('🔒')
  fireEvent.click(btn)
  expect(onSet).toHaveBeenCalledWith(false)
})

it('duration lock-all toggles durationLocked for the whole day', () => {
  const onSet = jest.fn()
  render(<ItineraryDay day={day([place('a'), place('b')])} dayIdx={0} mode="driving"
    onSetDayStartLock={jest.fn()} onSetDayDurationLock={onSet} />)
  fireEvent.click(screen.getByRole('button', { name: /整天鎖停留/ }))
  expect(onSet).toHaveBeenCalledWith(true)
})

it('disables lock-all buttons for an empty day', () => {
  render(<ItineraryDay day={day([])} dayIdx={0} mode="driving"
    onSetDayStartLock={jest.fn()} onSetDayDurationLock={jest.fn()} />)
  expect(screen.getByRole('button', { name: /整天鎖開始/ })).toBeDisabled()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest day-lock-all --silent`
Expected: FAIL — 標頭無「整天鎖開始/停留」按鈕。

- [ ] **Step 3: ItineraryDay 標頭加兩個整天全鎖按鈕**

In `components/ItineraryDay.tsx`：
- Props 新增：
  ```tsx
  onSetDayStartLock?: (locked: boolean) => void
  onSetDayDurationLock?: (locked: boolean) => void
  ```
  解構同步。
- 在 `<h2>第 {day.day} 天</h2>`（line 23）之後插入衍生狀態與兩個按鈕：
```tsx
      {(onSetDayStartLock || onSetDayDurationLock) && (() => {
        const has = day.places.length > 0
        const allStart = has && day.places.every((p) => p.startLocked)
        const allDur = has && day.places.every((p) => p.durationLocked)
        return (
          <div className="flex gap-2 mb-2">
            {onSetDayStartLock && (
              <button
                type="button"
                disabled={!has}
                onClick={() => onSetDayStartLock(!allStart)}
                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {allStart ? '🔒' : '🔓'} 整天鎖開始
              </button>
            )}
            {onSetDayDurationLock && (
              <button
                type="button"
                disabled={!has}
                onClick={() => onSetDayDurationLock(!allDur)}
                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {allDur ? '🔒' : '🔓'} 整天鎖停留
              </button>
            )}
          </div>
        )
      })()}
```

- [ ] **Step 4: ItineraryClient 整天 handlers + 下傳**

In `app/itinerary/ItineraryClient.tsx`：
- 在 Task 1 的 `toggleLockField` 之後新增（鏡像即時 `setPlan + planRef`、不重排）：
```tsx
  const setDayLockField = useCallback((dayIdx: number, field: 'startLocked' | 'durationLocked', locked: boolean) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return { ...d, places: d.places.map((p) => ({ ...p, [field]: locked })) }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleSetDayStartLock = useCallback(
    (dayIdx: number, locked: boolean) => setDayLockField(dayIdx, 'startLocked', locked),
    [setDayLockField]
  )
  const handleSetDayDurationLock = useCallback(
    (dayIdx: number, locked: boolean) => setDayLockField(dayIdx, 'durationLocked', locked),
    [setDayLockField]
  )
```
- `<ItineraryDay>` 新增：
  ```tsx
                onSetDayStartLock={(locked) => handleSetDayStartLock(dayIdx, locked)}
                onSetDayDurationLock={(locked) => handleSetDayDurationLock(dayIdx, locked)}
  ```

- [ ] **Step 5: 跑測試 + build**

Run: `npx jest day-lock-all --silent` → Expected: PASS（4 tests）。
Run: `npx jest --silent` → Expected: 全數通過。
Run: `npm run build` → Expected: 成功。

- [ ] **Step 6: Commit**

```bash
git add components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx __tests__/day-lock-all.test.tsx
git commit -m "feat: per-day lock-all toggles for start and duration locks"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §1 資料模型 → Task1 Step3；§2 兩鎖語意 + §3 排程 → Task1 Step4/6（錨點 startLocked、durationLocked 不影響錨定）；§4 卡片兩按鈕 + 各自靜態 + 拖曳綁 startLocked → Task1 Step6 + split-lock-card 測試；§5 每天兩個整天全鎖 + 衍生狀態 + 空天 disabled → Task2；§6 四個 handler、改鎖不重排 → Task1 Step8 + Task2 Step4；§7 遷移所有 timeLocked → Task1 Step5/9/10/11。
- **編譯綠燈：** `timeLocked` 為必填欄位，型別一改即破壞所有 fixture/讀取點；Task1 在同一任務內把 core（types/scheduler/schedule/RecommendPanel/test-drag）、卡片、Day、Client、全部測試一次遷移，故 Task1 結束即綠燈。`dragContainers.ts` 經查不引用 `timeLocked`，無需改。
- **型別一致：** `startLocked`/`durationLocked`、`onToggleStartLock`/`onToggleDurationLock`、`handleToggleStartLock`/`handleToggleDurationLock`、`onSetDayStartLock`/`onSetDayDurationLock`、`handleSetDayStartLock`/`handleSetDayDurationLock` 跨 Task 命名一致。
- **不在範圍：** 每地點 Google 估算停留時間（#5 另一部分）、住宿排程（#3）。
