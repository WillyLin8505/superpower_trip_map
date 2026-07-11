# 三鎖模型（開始/停留/結束）+ 鎖不影響拖曳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把兩鎖(開始/停留)擴充為三鎖(開始/停留/結束),鎖任兩個 → 第三個自動衍生並鎖定;並把「鎖」與「拖曳」解耦,任何卡片永遠可拖。

**Architecture:** 新增 `endLocked?` 布林;以純函式 `effectivePinned`(兩鎖推第三)為單一真相。排程把錨點從「鎖開始」一般化為「時間被釘住(開始或結束)」。卡片鎖只是時間限制,不再 disable 拖曳。

**Tech Stack:** Next.js 14.2、TypeScript strict、Jest(ts-jest/jsdom)、@dnd-kit。

**Spec:** `docs/superpowers/specs/2026-07-05-three-lock-model-design.md`

## Global Constraints

- TypeScript strict,無 `any`(必要處用明確型別或 `unknown`)。
- UI 文案繁體中文。
- `endLocked` 為**可選** `endLocked?: boolean`,讀取一律 `?? false`;既有 `ScheduledPlace` 建構點(含 40 處測試)零遷移。
- 「兩鎖推第三」只存在於 `effectivePinned` 純函式,不新增衍生布林(單一真相)。
- 鎖**永不** disable 拖曳或隱藏 drag handle。
- 用 `next build` 當最終 gate(`npm test` / `lint` 會漏掉 Vercel-breaking 錯誤)。
- ⚠️ Windows Jest 原生 binding:執行測試前若噴 binding 錯誤,先依專案記憶本機補上,勿 commit。

## File Structure

| 檔案 | 責任 |
|---|---|
| `lib/types.ts`(改) | `ScheduledPlace` 加 `endLocked?: boolean` |
| `lib/utils/lockDerive.ts`(新) | `effectivePinned` / `isTimeAnchored` / `isDerived` 純函式 |
| `lib/utils/clientScheduler.ts`(改) | `recalcDay` 錨點 = 時間被釘;`extendLastAccommodation` 尊重結束鎖 |
| `lib/utils/arrangeDay.ts`(改) | 錨點判定納入 `isTimeAnchored` |
| `components/ItineraryCard.tsx`(改) | 第三 toggle、衍生 disabled、pickers 依自由 facet、drag 解耦 |
| `components/CardContent.tsx`(改) | 同上(timeline 共用內容) |
| `components/TimelineCard.tsx`(改) | drag 解耦 |
| `components/ItineraryDay.tsx` / `components/TimelineDay.tsx`(改) | 傳遞 `onToggleEndLock` |
| `app/itinerary/ItineraryClient.tsx`(改) | `toggleLockField` 納入 `endLocked`、`handleToggleEndLock`、`handleTimeChange` 結束鎖行為、串接 |

---

## Task 1: `endLocked` 欄位 + 鎖衍生純函式

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/utils/lockDerive.ts`
- Test: `__tests__/lock-derive.test.ts`

**Interfaces:**
- Produces:
  - `ScheduledPlace.endLocked?: boolean`
  - `effectivePinned(p): { start: boolean; duration: boolean; end: boolean }` — 兩鎖時三者皆 true
  - `isTimeAnchored(p): boolean` — start 或 end 被釘
  - `isDerived(p, facet): boolean` — 該 facet 被有效釘住但使用者未直接點鎖

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/lock-derive.test.ts`:
```ts
import { effectivePinned, isTimeAnchored, isDerived } from '@/lib/utils/lockDerive'

const L = (o: Partial<{ startLocked: boolean; durationLocked: boolean; endLocked: boolean }>) => o

it('no locks → nothing pinned', () => {
  expect(effectivePinned(L({}))).toEqual({ start: false, duration: false, end: false })
  expect(isTimeAnchored(L({}))).toBe(false)
})
it('single start lock → only start pinned + time-anchored', () => {
  expect(effectivePinned(L({ startLocked: true }))).toEqual({ start: true, duration: false, end: false })
  expect(isTimeAnchored(L({ startLocked: true }))).toBe(true)
})
it('single end lock → only end pinned + time-anchored', () => {
  expect(effectivePinned(L({ endLocked: true }))).toEqual({ start: false, duration: false, end: true })
  expect(isTimeAnchored(L({ endLocked: true }))).toBe(true)
})
it('single duration lock → duration pinned but NOT time-anchored', () => {
  expect(effectivePinned(L({ durationLocked: true }))).toEqual({ start: false, duration: true, end: false })
  expect(isTimeAnchored(L({ durationLocked: true }))).toBe(false)
})
it('two locks → all three pinned (third derived)', () => {
  expect(effectivePinned(L({ startLocked: true, durationLocked: true }))).toEqual({ start: true, duration: true, end: true })
  expect(isDerived(L({ startLocked: true, durationLocked: true }), 'end')).toBe(true)
  expect(isDerived(L({ startLocked: true, durationLocked: true }), 'start')).toBe(false)
})
it('the un-clicked facet of a two-lock pair is the derived one', () => {
  expect(isDerived(L({ endLocked: true, durationLocked: true }), 'start')).toBe(true)
  expect(isDerived(L({ startLocked: true, endLocked: true }), 'duration')).toBe(true)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest lock-derive`
Expected: FAIL(`Cannot find module '@/lib/utils/lockDerive'`)。

- [ ] **Step 3: 加 `endLocked` 欄位**

Edit `lib/types.ts`,於 `ScheduledPlace` 的 `durationLocked` 之後追加:
```ts
  endLocked?: boolean        // 鎖結束時間（可選;讀取一律 ?? false）
```

- [ ] **Step 4: 實作純函式**

Create `lib/utils/lockDerive.ts`:
```ts
type LockLike = { startLocked?: boolean; durationLocked?: boolean; endLocked?: boolean }
export type Facet = 'start' | 'duration' | 'end'
export interface PinnedFacets { start: boolean; duration: boolean; end: boolean }

// 兩鎖 → 第三個自動固定(數學上 end = start + duration)
export function effectivePinned(p: LockLike): PinnedFacets {
  const s = !!p.startLocked, d = !!p.durationLocked, e = !!p.endLocked
  const count = (s ? 1 : 0) + (d ? 1 : 0) + (e ? 1 : 0)
  if (count >= 2) return { start: true, duration: true, end: true }
  return { start: s, duration: d, end: e }
}

// 開始或結束被釘 = 有固定時間位置(排程錨點)
export function isTimeAnchored(p: LockLike): boolean {
  const e = effectivePinned(p)
  return e.start || e.end
}

// 該 facet 被有效釘住,但使用者沒直接點它的鎖(= 衍生鎖)
export function isDerived(p: LockLike, facet: Facet): boolean {
  const userLocked = facet === 'start' ? !!p.startLocked : facet === 'duration' ? !!p.durationLocked : !!p.endLocked
  return effectivePinned(p)[facet] && !userLocked
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx jest lock-derive`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/utils/lockDerive.ts __tests__/lock-derive.test.ts
git commit -m "feat(locks): endLocked field + effectivePinned/isTimeAnchored/isDerived helpers"
```

---

## Task 2: 排程錨點一般化(開始或結束被釘)

**Files:**
- Modify: `lib/utils/clientScheduler.ts`, `lib/utils/arrangeDay.ts`
- Test: `__tests__/end-lock-schedule.test.ts`

**Interfaces:**
- Consumes: `isTimeAnchored`, `effectivePinned`(Task 1)。
- Produces: `recalcDay` 對 `endLocked` 地點視為錨點(保留其 `startTime`,鄰居繞排);`arrangeDay` 重排時把時間錨點固定不動。

> 說明:錨點以 `startTime` 為真相。「結束鎖 → 改停留會移動開始」由 Task 5 的編輯 handler 維持(改停留時重算 startTime),排程本身只需把被釘者當錨點固定。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/end-lock-schedule.test.ts`:
```ts
import { recalcDay } from '@/lib/utils/clientScheduler'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 0, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const day = (places: ScheduledPlace[]): DayItinerary => ({ day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' })

it('an end-locked place is treated as an anchor: keeps its startTime, neighbours flow around it', () => {
  // B is end-locked at 14:00-15:00; A before it should be back-scheduled, C after forward-scheduled
  const out = recalcDay(day([
    sp('A', { durationMin: 60, travelMinToNext: 0 }),
    sp('B', { startTime: '14:00', durationMin: 60, endLocked: true, travelMinToNext: 0 }),
    sp('C', { durationMin: 60 }),
  ]), '2026-07-05')
  expect(out.places[1].startTime).toBe('14:00')      // anchor kept
  expect(out.places[0].startTime).toBe('13:00')      // A back-scheduled to end right at B
  expect(out.places[2].startTime).toBe('15:00')      // C forward from B end
})

it('a duration-locked-only place is NOT an anchor (flows forward from day start)', () => {
  const out = recalcDay(day([
    sp('A', { durationMin: 60, travelMinToNext: 0 }),
    sp('B', { startTime: '14:00', durationLocked: true }),
  ]), '2026-07-05')
  expect(out.places[0].startTime).toBe('09:00')
  expect(out.places[1].startTime).toBe('10:00')      // flowed, not anchored at 14:00
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest end-lock-schedule`
Expected: FAIL(B 未被當錨點,A/C 位置錯)。

- [ ] **Step 3: `recalcDay` 錨點一般化**

Edit `lib/utils/clientScheduler.ts`:

(a) import 追加(檔頭):
```ts
import { isTimeAnchored, effectivePinned } from '@/lib/utils/lockDerive'
```

(b) `recalcDay` 內把 `lockIndices` 的判定由 `p.startLocked` 改為 `isTimeAnchored(p)`:
```ts
  const lockIndices = places.reduce<number[]>((acc, p, i) => (isTimeAnchored(p) ? [...acc, i] : acc), [])
```

(c) `extendLastAccommodation` 加結束鎖保護(檔案 L46):
```ts
  if (last.type !== 'accommodation' || last.durationLocked || effectivePinned(last).end) return places
```

- [ ] **Step 4: `arrangeDay` 錨點一般化**

Edit `lib/utils/arrangeDay.ts`:

(a) import 追加:
```ts
import { isTimeAnchored } from '@/lib/utils/lockDerive'
```

(b) L70 與 L77 的 `p.startLocked` 改為 `isTimeAnchored(p)`:
```ts
  const unlocked = places.filter((p) => !isTimeAnchored(p))
```
```ts
  places.forEach((p, i) => { if (isTimeAnchored(p)) lockedAt.set(i, p) })
```

- [ ] **Step 5: 跑測試確認通過 + 回歸**

Run: `npx jest end-lock-schedule client-scheduler arrangeDay`
Expected: PASS(新測試綠、既有排程測試不破)。

- [ ] **Step 6: Commit**

```bash
git add lib/utils/clientScheduler.ts lib/utils/arrangeDay.ts __tests__/end-lock-schedule.test.ts
git commit -m "feat(locks): scheduler anchors on any pinned time (start OR end)"
```

---

## Task 3: 鎖與拖曳解耦

**Files:**
- Modify: `components/ItineraryCard.tsx`, `components/TimelineCard.tsx`
- Test: `__tests__/lock-drag-decouple.test.tsx`

**Interfaces:**
- Produces: 任何鎖狀態的卡片 `useSortable` 皆 **不** disabled、drag handle 皆顯示(清單可拖時)。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/lock-drag-decouple.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}

it('start-locked card still shows the drag handle (drag decoupled from locks)', () => {
  render(<ItineraryCard place={sp({ startLocked: true })} index={0} dateIso="2026-07-05" draggable />)
  expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest lock-drag-decouple`
Expected: FAIL(startLocked 時 handle 被隱藏)。

- [ ] **Step 3: 解耦 `ItineraryCard`**

Edit `components/ItineraryCard.tsx`:
- `useSortable`(L31)去掉 `|| place.startLocked`:
```ts
    useSortable({ id: place.id, disabled: !draggable })
```
- drag handle 顯示條件(L57)由 `draggable && !place.startLocked` 改為 `draggable`:
```tsx
        {draggable && (
```

- [ ] **Step 4: 解耦 `TimelineCard`**

Edit `components/TimelineCard.tsx`:
- `useSortable`(L24):
```ts
    useSortable({ id: place.id, disabled: !draggable })
```
- drag handle(L72)`draggable && !place.startLocked` → `draggable`:
```tsx
        {draggable && (
```

- [ ] **Step 5: 跑測試確認通過 + 回歸**

Run: `npx jest lock-drag-decouple itinerary-card timeline-card drag`
Expected: PASS。

> 注:若既有測試斷言「startLocked 時 handle 不存在」,依新行為更新該斷言(鎖不再隱藏 handle 是本案刻意變更)。

- [ ] **Step 6: Commit**

```bash
git add components/ItineraryCard.tsx components/TimelineCard.tsx __tests__/lock-drag-decouple.test.tsx
git commit -m "feat(locks): decouple locks from drag — locked cards stay draggable"
```

---

## Task 4: 三鎖 toggle UI + 串接(結束鎖 + 衍生 disabled)

**Files:**
- Modify: `components/ItineraryCard.tsx`, `components/CardContent.tsx`, `components/ItineraryDay.tsx`, `components/TimelineDay.tsx`, `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/lock-toggles.test.tsx`, `__tests__/itinerary-client-end-lock.test.tsx`

**Interfaces:**
- Consumes: `effectivePinned`, `isDerived`(Task 1)。
- Produces:
  - `ItineraryCard` / `CardContent` 新增 prop `onToggleEndLock?: (placeId: string) => void`;渲染三個 toggle(開始/停留/結束),各自 `🔒` 顯示 `effectivePinned[facet]`、`disabled` = `isDerived(place, facet)`。
  - `ItineraryClient` `handleToggleEndLock`;`toggleLockField` union 納入 `'endLocked'`。

- [ ] **Step 1: 寫失敗測試(卡片三 toggle + 衍生 disabled)**

Create `__tests__/lock-toggles.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const handlers = { onToggleStartLock: () => {}, onToggleDurationLock: () => {}, onToggleEndLock: jest.fn() }

it('renders three lock toggles: 開始 / 停留 / 結束', () => {
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-05" {...handlers} />)
  expect(screen.getByRole('button', { name: /開始/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /停留/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /結束/ })).toBeInTheDocument()
})
it('the derived third lock is disabled when the other two are locked', () => {
  // start + duration locked → 結束 is derived → disabled
  render(<ItineraryCard place={sp({ startLocked: true, durationLocked: true })} index={0} dateIso="2026-07-05" {...handlers} />)
  expect(screen.getByRole('button', { name: /結束/ })).toBeDisabled()
})
it('clicking 結束 calls onToggleEndLock', () => {
  const onToggleEndLock = jest.fn()
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-05" {...handlers} onToggleEndLock={onToggleEndLock} />)
  fireEvent.click(screen.getByRole('button', { name: /結束/ }))
  expect(onToggleEndLock).toHaveBeenCalledWith('A')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest lock-toggles`
Expected: FAIL(無結束 toggle)。

- [ ] **Step 3: `ItineraryCard` 三 toggle**

Edit `components/ItineraryCard.tsx`:
- import(檔頭)追加:
```ts
import { effectivePinned, isDerived } from '@/lib/utils/lockDerive'
```
- Props 介面加 `onToggleEndLock?: (placeId: string) => void`,並在解構加入 `onToggleEndLock`。
- 把右側鎖按鈕區(現為兩顆)改為三顆。條件由 `(onToggleStartLock || onToggleDurationLock)` 改為包含 end;每顆的 `🔒/🔓` 用 `effectivePinned(place)`,`disabled` 用 `isDerived`:
```tsx
{(onToggleStartLock || onToggleDurationLock || onToggleEndLock) && (() => {
  const pin = effectivePinned(place)
  return (
    <div className="flex flex-col gap-1 shrink-0 mt-0.5">
      {onToggleStartLock && (
        <button type="button" onClick={() => onToggleStartLock(place.id)} disabled={isDerived(place, 'start')}
          className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
          title={isDerived(place, 'start') ? '由另外兩個鎖自動決定' : undefined}
          aria-label={pin.start ? '解鎖開始時間' : '鎖定開始時間'}>
          {pin.start ? '🔒' : '🔓'} 開始
        </button>
      )}
      {onToggleDurationLock && (
        <button type="button" onClick={() => onToggleDurationLock(place.id)} disabled={isDerived(place, 'duration')}
          className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
          title={isDerived(place, 'duration') ? '由另外兩個鎖自動決定' : undefined}
          aria-label={pin.duration ? '解鎖停留時間' : '鎖定停留時間'}>
          {pin.duration ? '🔒' : '🔓'} 停留
        </button>
      )}
      {onToggleEndLock && (
        <button type="button" onClick={() => onToggleEndLock(place.id)} disabled={isDerived(place, 'end')}
          className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
          title={isDerived(place, 'end') ? '由另外兩個鎖自動決定' : undefined}
          aria-label={pin.end ? '解鎖結束時間' : '鎖定結束時間'}>
          {pin.end ? '🔒' : '🔓'} 結束
        </button>
      )}
    </div>
  )
})()}
```

- [ ] **Step 4: `CardContent` 同步三 toggle(timeline 共用)**

Edit `components/CardContent.tsx`:同 Step 3 的三顆按鈕結構(用 `effectivePinned`/`isDerived`),Props 加 `onToggleEndLock?`,條件納入 end。import `effectivePinned, isDerived`。

- [ ] **Step 5: 跑卡片測試確認通過**

Run: `npx jest lock-toggles`
Expected: PASS。

- [ ] **Step 6: 寫失敗測試(client 串接:點結束 → 設 endLocked)**

Create `__tests__/itinerary-client-end-lock.test.tsx`(沿用 `itinerary-client-smart-arrange.test.tsx` 的 mock 樣板:mock @dnd-kit、clientScheduler recalcPlan 為 identity、recommend、CombinedInput、geo、dragContainers、mapUrl、hours;複製其 `sp`/`plan`):
```tsx
// ...（複製 smart-arrange 測試的 mock 區塊與 sp/plan helper）
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

it('clicking 結束 on a card locks its end (🔒 結束)', async () => {
  render(<ItineraryClient initial={plan()} />)
  const endBtn = within(screen.getByTestId('card-A')).getByRole('button', { name: /結束/ })
  fireEvent.click(endBtn)
  await waitFor(() => expect(within(screen.getByTestId('card-A')).getByRole('button', { name: '解鎖結束時間' })).toBeInTheDocument())
})
```

- [ ] **Step 7: 跑測試確認失敗**

Run: `npx jest itinerary-client-end-lock`
Expected: FAIL(卡片無結束鈕 / 未串接)。

- [ ] **Step 8: `ItineraryClient` 串接 endLocked**

Edit `app/itinerary/ItineraryClient.tsx`:
- `toggleLockField` 的 field union 由 `'startLocked' | 'durationLocked'` 改為加 `'endLocked'`:
```ts
  const toggleLockField = useCallback((dayIdx: number, placeId: string, field: 'startLocked' | 'durationLocked' | 'endLocked') => {
```
- 新增 handler(接在 `handleToggleDurationLock` 之後):
```ts
  const handleToggleEndLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'endLocked'),
    [toggleLockField]
  )
```
- `<ItineraryDay>` render 加(接在 `onToggleDurationLock` 之後):
```tsx
                onToggleEndLock={(placeId) => handleToggleEndLock(dayIdx, placeId)}
```

- [ ] **Step 9: `ItineraryDay` / `TimelineDay` 傳遞 prop**

Edit `components/ItineraryDay.tsx` 與 `components/TimelineDay.tsx`:Props 加 `onToggleEndLock?: (placeId: string) => void`,解構後傳給 `ItineraryCard`/`TimelineCard`(後者透過 `CardContent`):
```tsx
                    onToggleEndLock={onToggleEndLock}
```
(`TimelineCard` Props 亦加 `onToggleEndLock?` 並下傳給 `CardContent`。)

- [ ] **Step 10: 跑測試確認通過 + 全測試**

Run: `npx jest itinerary-client-end-lock lock-toggles && npx jest`
Expected: PASS,全綠。

- [ ] **Step 11: Commit**

```bash
git add components/ItineraryCard.tsx components/CardContent.tsx components/ItineraryDay.tsx components/TimelineDay.tsx components/TimelineCard.tsx app/itinerary/ItineraryClient.tsx __tests__/lock-toggles.test.tsx __tests__/itinerary-client-end-lock.test.tsx
git commit -m "feat(locks): third 結束 toggle + derived-lock disabling, wired through client"
```

---

## Task 5: 依自由 facet 的時間編輯器 + 結束鎖編輯行為

**Files:**
- Modify: `components/ItineraryCard.tsx`, `components/CardContent.tsx`, `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/lock-editors.test.tsx`

**Interfaces:**
- Consumes: `effectivePinned`(Task 1)。
- Produces:
  - start picker 顯示 iff `!effectivePinned(place).start`;end picker 顯示 iff `!effectivePinned(place).end && !effectivePinned(place).duration`。
  - `handleTimeChange`:編輯 `startTime` 且該地點**結束被釘、開始未釘**時,保持結束不變、改動停留(`durationMin = 舊結束 − 新開始`)。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/lock-editors.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const noop = () => {}

it('end-locked (alone) → start picker editable, end shown static', () => {
  render(<ItineraryCard place={sp({ endLocked: true })} index={0} dateIso="2026-07-05" onTimeChange={noop} />)
  // start editable (picker present as a spinbutton/textbox from TimeScrollPicker), end static text 10:00
  expect(screen.getByText('10:00')).toBeInTheDocument()   // end = 09:00 + 60 shown static
})
it('two locks (start+duration) → both facets static (no pickers)', () => {
  const { container } = render(<ItineraryCard place={sp({ startLocked: true, durationLocked: true })} index={0} dateIso="2026-07-05" onTimeChange={noop} />)
  // start static 09:00 and end static 10:00, no interactive time pickers
  expect(screen.getByText('09:00')).toBeInTheDocument()
  expect(screen.getByText('10:00')).toBeInTheDocument()
  expect(container.querySelectorAll('[data-testid="time-scroll-picker"]').length).toBe(0)
})
```

> 註:`TimeScrollPicker` 若無 `data-testid`,實作時給其根節點加 `data-testid="time-scroll-picker"`(僅測試用掛點,非行為)。斷言以「靜態文字存在 + 無 picker 節點」為準;若元件結構不同,依實際 DOM 調整選擇器,勿改元件行為。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest lock-editors`
Expected: FAIL(目前 picker 顯示條件只看 startLocked/durationLocked,結束鎖與衍生未納入)。

- [ ] **Step 3: `ItineraryCard` picker 顯示條件**

Edit `components/ItineraryCard.tsx` 時間列(L93–L?):
- 於 return 前算 `const pin = effectivePinned(place)`(若 Step 3/Task4 已算則共用)。
- start:`place.startLocked || !onTimeChange` → `pin.start || !onTimeChange`。
- end:`place.durationLocked || !onTimeChange` → `pin.end || pin.duration || !onTimeChange`。

- [ ] **Step 4: `CardContent` 同步(timeline)**

Edit `components/CardContent.tsx` 時間列(L37–L57):同 Step 3(start:`pin.start || !onTimeChange`;end:`pin.end || pin.duration || !onTimeChange`),`pin = effectivePinned(place)`。

- [ ] **Step 5: `TimeScrollPicker` 加測試掛點**

Edit `components/TimeScrollPicker.tsx`:根節點加 `data-testid="time-scroll-picker"`(不改任何行為)。

- [ ] **Step 6: 跑卡片測試確認通過**

Run: `npx jest lock-editors`
Expected: PASS。

- [ ] **Step 7: 寫失敗測試(結束鎖下改開始 → 保持結束)**

Append to `__tests__/lock-editors.test.tsx`(client 層,沿用 smart-arrange mock 樣板;或加到既有 client 測試):
```tsx
// 以 handleTimeChange 純邏輯驗證:end-locked 改 start,end 不變、duration 補償。
// 直接測 client 行為:透過 start picker 觸發 onTimeChange('startTime','08:30')
// 期望該地點 durationMin 變 90(舊 end 10:00 − 新 start 08:30),startTime 08:30。
```
> 實作:在 client 測試中,render `<ItineraryClient>` 帶一個 `endLocked` 地點,透過 start picker(或直接呼叫暴露的 handler 測試路徑)改開始為 08:30,斷言其結束仍為 10:00(卡片顯示 10:00),即 duration 已補償為 90。若 picker 互動在 jsdom 難觸發,改以單元測試抽出的 `applyTimeChange(place, field, value)` 純函式驗證(見 Step 8 抽純函式)。

- [ ] **Step 8: `handleTimeChange` 結束鎖行為(抽純函式 + 套用)**

Edit `app/itinerary/ItineraryClient.tsx`:抽一個純函式並在 `handleTimeChange` 內套用:
```ts
// 檔內(或 lib/utils/lockDerive.ts）:結束被釘、開始未釘時,改開始要保持結束不變
function applyTimeEdit(p: ScheduledPlace, field: 'startTime' | 'durationMin', value: string | number): ScheduledPlace {
  if (field === 'startTime' && p.endLocked && !p.startLocked && typeof value === 'string') {
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const oldEnd = toMin(p.startTime) + p.durationMin
    const newDur = oldEnd - toMin(value)
    return { ...p, startTime: value, durationMin: newDur > 0 ? newDur : p.durationMin }
  }
  return { ...p, [field]: value }
}
```
在 `handleTimeChange` 內把 `p.id === placeId ? { ...p, [field]: value } : p` 改為 `p.id === placeId ? applyTimeEdit(p, field, value) : p`。

> 若抽為 export 純函式,放 `lib/utils/lockDerive.ts` 並在 Step 7 直接單元測試 `applyTimeEdit`(較 jsdom picker 互動穩)。

- [ ] **Step 9: 跑測試確認通過 + 全測試**

Run: `npx jest lock-editors && npx jest`
Expected: PASS,全綠。

- [ ] **Step 10: Commit**

```bash
git add components/ItineraryCard.tsx components/CardContent.tsx components/TimeScrollPicker.tsx app/itinerary/ItineraryClient.tsx __tests__/lock-editors.test.tsx
git commit -m "feat(locks): free-facet time editors + end-lock keeps end when start edited"
```

---

## Task 6: 收尾 — supersede 註記 + 全測試 gate

**Files:**
- Modify: `docs/superpowers/specs/2026-06-28-split-time-lock-design.md`(加 superseded 註記)

- [ ] **Step 1: 標記舊 spec 被取代**

Edit `docs/superpowers/specs/2026-06-28-split-time-lock-design.md`,於檔頭第一行下方加:
```markdown
> **SUPERSEDED（2026-07-05）** by `docs/superpowers/specs/2026-07-05-three-lock-model-design.md`：改為三鎖(開始/停留/結束)、兩鎖推第三、且鎖不再禁止拖曳。
```

- [ ] **Step 2: 全測試 + lint + build**

Run:
```bash
npx jest && npm run lint && npm run build
```
Expected:全綠、無 type error、build 成功。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-28-split-time-lock-design.md
git commit -m "docs(locks): mark two-lock spec superseded by three-lock model"
```

---

## Self-Review（對照 spec）

**Spec coverage:**
- §1.1 鎖與拖曳解耦 → Task 3 ✅
- §1.2 三鎖 → Task 1(欄位)、Task 4(UI)✅
- §1.3 兩鎖推第三、第三 disabled → Task 1(`effectivePinned`/`isDerived`)、Task 4(disabled)✅
- §1.4 排程尊重釘住時間(開始錨、結束回推、停留不縮) → Task 2(錨點)、Task 5(結束鎖改開始補償)✅
- §2 資料模型(endLocked 可選、effectivePinned 單一真相) → Task 1 ✅
- §3 UI(三 toggle、衍生 disabled、自由 facet 編輯器、drag handle 常顯) → Task 4、Task 5、Task 3 ✅
- §3 整天鎖維持兩顆 → 不動(Task 未加第三顆)✅
- §4 排程一般化 + extendLastAccommodation 尊重結束鎖 → Task 2 ✅
- §5 拖曳解耦(useSortable/handle) → Task 3 ✅
- §6 邊界/endLocked 可選 → Global Constraints + Task 1 ✅
- §7 測試 → 各 Task 的 TDD 步驟 ✅

**Placeholder scan:** Task 5 Step 7 的 client 互動測試給了「picker 難觸發則改測抽出的 `applyTimeEdit` 純函式」明確替代路徑(非 TBD)。其餘皆含可執行碼。

**Type consistency:** `effectivePinned`→`PinnedFacets{start,duration,end}`、`isTimeAnchored`、`isDerived(p,facet)`、`onToggleEndLock(placeId)`、`toggleLockField(...,'endLocked')`、`applyTimeEdit(p,field,value)` 跨任務一致。
