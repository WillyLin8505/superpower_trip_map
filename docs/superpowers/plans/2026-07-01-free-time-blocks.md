# 空閒時間區塊顯示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在每天卡片串中，於空閒（idle ≥15 分）出現的位置穿插一個低調的「⏱ 空閒 N 分/小時」區塊（含一天結尾剩餘），純衍生顯示。

**Architecture:** 純函式 `lib/utils/freeTime.ts`（`freeBlocks` 算出空閒、`formatGap` 格式化）；`components/ItineraryDay.tsx` 在既有卡片 `.map` 中依 `afterId` 穿插 pill。只改這兩處，不動 `ItineraryClient`/資料層。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Jest + Testing Library (jsdom)。

## Global Constraints

- TypeScript strict，無 `any`。不新增 npm 套件。
- UI 文案繁體中文。
- 純衍生顯示 → 零 fixture 遷移（不新增儲存欄位）。
- 決定性（同輸入同輸出，無隨機/時間相依）。
- 只改 `ItineraryDay` + 新純函式檔；不動 `ItineraryClient`/`ItineraryCard`/資料層。
- 空閒門檻 ≥ 15 分（卡片間與天尾同門檻）。
- 既有全測試需保持綠。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/utils/freeTime.ts`（新） | `freeBlocks`（計算空閒區塊）+ `formatGap`（格式化）純函式 |
| `components/ItineraryDay.tsx`（改） | 卡片 `.map` 中穿插空閒 pill（衍生自 `freeBlocks`） |

---

## Task 1: 純函式 `freeTime.ts`（`freeBlocks` + `formatGap`）

**Files:** Create `lib/utils/freeTime.ts`; Test `__tests__/free-time.test.ts`

**Interfaces — Consumes:** `ScheduledPlace`（`@/lib/types`）；`minsToTime`（`@/lib/utils/time`）。
**Produces:**
- `interface FreeBlock { afterId: string; minutes: number; untilTime?: string }`
- `formatGap(minutes: number): string`
- `freeBlocks(places: ScheduledPlace[], dayEndMin: number, minGapMin?: number): FreeBlock[]`（`minGapMin` 預設 15）

- [ ] **Step 1: 失敗測試** — Create `__tests__/free-time.test.ts`:
```ts
import { freeBlocks, formatGap } from '@/lib/utils/freeTime'
import type { ScheduledPlace } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}

it('formatGap: minutes < 60 → "N 分"', () => {
  expect(formatGap(40)).toBe('40 分')
  expect(formatGap(5)).toBe('5 分')
})
it('formatGap: whole hours → "N 小時"', () => {
  expect(formatGap(60)).toBe('1 小時')
  expect(formatGap(300)).toBe('5 小時')
})
it('formatGap: hours + minutes → "N 小時 M 分"', () => {
  expect(formatGap(80)).toBe('1 小時 20 分')
})

it('freeBlocks: card-gap >= 15 produces a block after that card', () => {
  // A 09:00 (60min) + 10 travel → ends+travel 10:10; B locked 11:00 → gap 50
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 })
  const B = sp('B', { startTime: '11:00', durationMin: 60, startLocked: true })
  // dayEnd = 12:00 so B end (12:00) leaves 0 remaining → no end block, isolating the card-gap
  expect(freeBlocks([A, B], 12 * 60)).toEqual([{ afterId: 'A', minutes: 50 }])
})
it('freeBlocks: card-gap < 15 produces no block', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 }) // ends+travel 10:10
  const B = sp('B', { startTime: '10:20', durationMin: 60 })                       // gap 10 < 15
  // B ends 11:20; dayEnd 11:30 → remaining 10 < 15 → no end block
  expect(freeBlocks([A, B], 11 * 60 + 30)).toEqual([])
})
it('freeBlocks: negative gap (overlap/overflow) produces no block', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 30 }) // ends+travel 10:30
  const B = sp('B', { startTime: '10:00', durationMin: 60 })                       // gap -30
  expect(freeBlocks([A, B], 11 * 60)).toEqual([])  // B ends 11:00, dayEnd 11:00 → 0 remaining
})
it('freeBlocks: day-end remaining >= 15 produces a block with untilTime', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60 }) // ends 10:00
  // single card; dayEnd 21:00 → remaining 660
  expect(freeBlocks([A], 21 * 60)).toEqual([{ afterId: 'A', minutes: 660, untilTime: '21:00' }])
})
it('freeBlocks: empty day → []', () => {
  expect(freeBlocks([], 21 * 60)).toEqual([])
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest free-time --silent` → FAIL（模組不存在）。

- [ ] **Step 3: 實作** — Create `lib/utils/freeTime.ts`:
```ts
import type { ScheduledPlace } from '@/lib/types'
import { minsToTime } from '@/lib/utils/time'

export interface FreeBlock {
  afterId: string
  minutes: number
  untilTime?: string
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes} 分`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`
}

export function freeBlocks(
  places: ScheduledPlace[],
  dayEndMin: number,
  minGapMin = 15
): FreeBlock[] {
  if (places.length === 0) return []
  const out: FreeBlock[] = []
  for (let i = 0; i < places.length - 1; i++) {
    const cur = places[i]
    const next = places[i + 1]
    const gap = toMin(next.startTime) - (toMin(cur.startTime) + cur.durationMin + (cur.travelMinToNext ?? 0))
    if (gap >= minGapMin) out.push({ afterId: cur.id, minutes: gap })
  }
  const last = places[places.length - 1]
  const remaining = dayEndMin - (toMin(last.startTime) + last.durationMin)
  if (remaining >= minGapMin) out.push({ afterId: last.id, minutes: remaining, untilTime: minsToTime(dayEndMin) })
  return out
}
```

- [ ] **Step 4: 跑測試 + build** — `npx jest free-time --silent` PASS（7 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add lib/utils/freeTime.ts __tests__/free-time.test.ts
git commit -m "feat: freeBlocks + formatGap — derive idle free-time blocks per day"
```

---

## Task 2: `ItineraryDay` 穿插空閒 pill

**Files:** Modify `components/ItineraryDay.tsx`; Test `__tests__/itinerary-day-free-time.test.tsx`

**Interfaces — Consumes:** `freeBlocks`、`formatGap`（Task 1）。`ItineraryDay` 既有 `toMin` helper（檔內 line 8-11）。

- [ ] **Step 1: 失敗測試** — Create `__tests__/itinerary-day-free-time.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
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

it('renders a free-time pill after a card when a gap >= 15 exists', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 }) // ends+travel 10:10
  const B = sp('B', { startTime: '11:00', durationMin: 60, startLocked: true })   // gap 50
  render(<ItineraryDay day={day([A, B], { dayEnd: '12:00' })} dayIdx={0} mode="driving" startDate="2026-07-01" />)
  expect(screen.getByTestId('free-block-A')).toHaveTextContent('空閒 50 分')
})
it('renders a day-end pill with 到 HH:MM', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60 }) // ends 10:00 → remaining to 21:00 = 660 = 11 小時
  render(<ItineraryDay day={day([A])} dayIdx={0} mode="driving" startDate="2026-07-01" />)
  expect(screen.getByTestId('free-block-A')).toHaveTextContent('空閒 11 小時（到 21:00）')
})
it('renders no pill when all gaps are below threshold', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 }) // ends+travel 10:10
  const B = sp('B', { startTime: '10:20', durationMin: 60 })                       // gap 10 < 15
  render(<ItineraryDay day={day([A, B], { dayEnd: '11:30' })} dayIdx={0} mode="driving" startDate="2026-07-01" />)
  expect(screen.queryByText(/空閒/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest itinerary-day-free-time --silent` → FAIL。

- [ ] **Step 3: 實作** — In `components/ItineraryDay.tsx`：
  - 頂部 import 加：`import { Fragment } from 'react'` 與 `import { freeBlocks, formatGap } from '@/lib/utils/freeTime'`。
  - 把卡片 `.map`（line 139-153）整段換成：
    ```tsx
    {(() => {
      const byAfter = new Map(
        freeBlocks(day.places, toMin(day.dayEnd)).map((b) => [b.afterId, b] as const)
      )
      return day.places.map((place, i) => {
        const fb = byAfter.get(place.id)
        return (
          <Fragment key={place.id}>
            <ItineraryCard
              place={place}
              index={i}
              dateIso={dayDate(startDate, day.day)}
              draggable={draggable}
              onTimeChange={onTimeChange}
              onToggleStartLock={onToggleStartLock}
              onToggleDurationLock={onToggleDurationLock}
              onChangeType={onChangeType}
              onChangeLegMode={onChangeLegMode}
              legBusy={legBusyPlaceId === place.id}
            />
            {fb && (
              <div
                data-testid={`free-block-${fb.afterId}`}
                className="text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-1.5 flex items-center gap-1"
              >
                &#x23F1; 空閒 {formatGap(fb.minutes)}{fb.untilTime ? `（到 ${fb.untilTime}）` : ''}
              </div>
            )}
          </Fragment>
        )
      })
    })()}
    ```
    > 卡片改包在 `<Fragment key={place.id}>` 中（Fragment 不產生 DOM 節點，故容器的 `space-y-3` 仍套用在卡片與 pill 之間）；`ItineraryCard` 的 props 與原本完全一致，只是外層多包 Fragment 並在其後條件式渲染 pill。

- [ ] **Step 4: 跑測試 + build** — `npx jest itinerary-day-free-time --silent` PASS（3 tests）；`npx jest --silent` 全綠（既有 ItineraryDay 測試不受影響——僅在卡片後新增條件式 pill）；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add components/ItineraryDay.tsx __tests__/itinerary-day-free-time.test.tsx
git commit -m "feat: show free-time blocks between cards + day-end remaining in ItineraryDay"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §2 空閒定義（卡片間 gap / 天尾 remaining、≥15 門檻）→ Task1 `freeBlocks`；§3 純函式介面 → Task1；§4 格式（分/小時/小時分、到 HH:MM）→ Task1 `formatGap` + Task2 pill；§5 UI 穿插 → Task2；§6 邊界（空天/負值/單卡）→ Task1 測試；§8 測試 → 兩 task。
- **零破壞：** 純新增檔 + `ItineraryDay` 僅於卡片後條件式插入 pill（`ItineraryCard` props 不變）；無新增儲存欄位、零 fixture 遷移。
- **型別一致：** `FreeBlock`、`freeBlocks`、`formatGap`、`afterId`/`minutes`/`untilTime` 跨 task 命名一致；`minsToTime` 來自既有 `lib/utils/time.ts`。
- **低衝突：** 不動 `ItineraryClient`/資料層（避開 Lane C 熱點）。
- **不在範圍：** 天首空閒；主動填空/推薦；任何動作。
