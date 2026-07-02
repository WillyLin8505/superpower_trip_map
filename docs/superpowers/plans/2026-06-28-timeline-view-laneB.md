# 時間軸視圖（Lane B portion）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立時間軸視圖所需的全新、零衝突檔案（純函式 + 三個元件 + 測試），讓 Lane A 之後只需在 `ItineraryClient` 加一個 viewMode 切換即可啟用。

**Architecture:** 純函式 `lib/utils/timeline.ts` 負責版面/resize/刻度數學；`CardContent` 抽出可共用的卡片內容；`TimelineCard` = 高度∝時長 + CardContent + 下緣 resize；`TimelineDay` = 左刻度 + flow 排列卡片（含旅行空檔）+ 地圖，**與當前 `ItineraryDay` 完整對齊（props 逐一相同、日期標籤/活動時間窗編輯/scatter/delete/整天鎖全部照現行渲染）**。順序 reflow 沿用既有 `recalcPlan`，不改排程模型。

**Tech Stack:** Next.js 14、TypeScript strict、@dnd-kit（既有）、原生 Pointer Events（resize）、Jest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-06-28-timeline-view-design.md`（Lane 分工見 §12）

## Global Constraints

- TypeScript strict，**不得用 `any`**。
- **不新增 npm 套件**。
- **Lane B 只新增檔案**：不得修改 `app/itinerary/ItineraryClient.tsx`、`components/ItineraryCard.tsx`（Lane A 整合點）。可 import 既有型別/元件/工具。
- UI 文案繁體中文。
- **時間相關 API（合併 main 後的現況）：** 營業時間用 `getHoursForDate(openingHours: string[]|null, dateIso: string)`（**`getTodayHours` 已不存在**）。每天的日期由 `dayDate(startDate, day.day)`（`@/lib/utils/date`）求得；`formatDateLabel(iso)` 產生「6/29（一）」標籤。
- `CardContent` 與 `TimelineCard` 都接收 `dateIso: string`（往下傳給 `getHoursForDate`）。
- **`TimelineDay` 的 props 必須與當前 `components/ItineraryDay.tsx` 逐一相同：** `day, dayIdx, mode, startDate, isDragging?, draggable?, isOverflow?, onScatter?, onDelete?, onTimeChange?, onToggleStartLock?, onToggleDurationLock?, onChangeType?, onSetDayStartLock?, onSetDayDurationLock?, onChangeWindow?`。並**完整對齊**其日期標籤、`isOverflow` 的 scatter/delete、`onChangeWindow` 的活動時間窗編輯、整天鎖、aiSummary、地圖。
- `DayItinerary` 具 `dayStart`/`dayEnd` 欄位（活動時間窗）；`day.places` 各項為 `ScheduledPlace`。
- 常數：`PX_PER_MIN = 1.2`、`MIN_CARD_PX = 36`、`RESIZE_SNAP_MIN = 5`、`MIN_DURATION_MIN = 5`（定義於 Task 1）。
- 測試：`npx jest <path>`。`@/` alias → 專案根。tsx 測試檔首行加 `/** @jest-environment jsdom */`。

---

### Task 1: 純函式 `lib/utils/timeline.ts` ✅（已完成 commit 12612bd）

> 已實作並通過審查（5/5）。`timelineLayout` / `pxToDuration` / `rulerTicks` + 常數。`rulerTicks` 第一個刻度用 `(Math.floor(dayStartMin/60)+1)*60`（剛好整點開始時不重複顯示起始刻度）。後續任務直接 import，不需重做。

---

### Task 2: 共用內容 `components/CardContent.tsx`（含 `dateIso`）

**Files:**
- Create: `components/CardContent.tsx`
- Test: `__tests__/card-content.test.tsx`

**Interfaces:**
- Consumes: `ScheduledPlace`, `PlaceType` (`@/lib/types`); `TYPE_META` (`@/lib/placeType`); `TimeScrollPicker`, `TypePicker`; `getHoursForDate` (`@/lib/utils/hours`); `addMinutes` (`@/lib/utils/time`).
- Produces: `CardContent({ place, dateIso, onTimeChange?, onToggleStartLock?, onToggleDurationLock?, onChangeType? })` — renders inner content (name/type/start-end pickers/今日hours via `getHoursForDate(place.openingHours, dateIso)`/rating/desc/lateExit) + lock-button column. Returns a Fragment (no outer wrapper / drag handle / number badge / travel line).

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/card-content.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { CardContent } from '@/components/CardContent'
import type { ScheduledPlace } from '@/lib/types'

function place(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: 'a', placeId: 'pid', name: '故宮', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: 4.5, photoUrl: null, description: '世界級博物館',
    startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

test('renders name, rating and description', () => {
  render(<CardContent place={place()} dateIso="2026-06-29" />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByText(/世界級博物館/)).toBeInTheDocument()
  expect(screen.getByText(/4\.5/)).toBeInTheDocument()
})

test('lock buttons fire callbacks', () => {
  const onStart = jest.fn()
  const onDur = jest.fn()
  render(<CardContent place={place()} dateIso="2026-06-29" onToggleStartLock={onStart} onToggleDurationLock={onDur} />)
  fireEvent.click(screen.getByLabelText('鎖定開始時間'))
  fireEvent.click(screen.getByLabelText('鎖定停留時間'))
  expect(onStart).toHaveBeenCalledWith('a')
  expect(onDur).toHaveBeenCalledWith('a')
})

test('lateExit warning shown when flagged', () => {
  render(<CardContent place={place({ lateExit: true })} dateIso="2026-06-29" />)
  expect(screen.getByText(/結束時間超出營業時間/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/card-content.test.tsx`
Expected: FAIL — cannot find module `@/components/CardContent`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/CardContent.tsx
'use client'
import { TimeScrollPicker } from './TimeScrollPicker'
import { TypePicker } from './TypePicker'
import { getHoursForDate } from '@/lib/utils/hours'
import { addMinutes } from '@/lib/utils/time'
import type { PlaceType, ScheduledPlace } from '@/lib/types'
import { TYPE_META } from '@/lib/placeType'

interface Props {
  place: ScheduledPlace
  dateIso: string
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
}

export function CardContent({ place, dateIso, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType }: Props) {
  const todayHours = getHoursForDate(place.openingHours, dateIso)
  const descriptionText = place.description || place.aiDescription
  const meta = TYPE_META[place.type]

  return (
    <>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900">{place.name}</h3>
          {onChangeType ? (
            <TypePicker type={place.type} onChange={(t) => onChangeType(place.id, t)} />
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
          )}
          {place.outsideHours && (
            <span className="text-xs text-orange-600 font-medium">&#x26A0; 請確認營業時間</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {place.startLocked || !onTimeChange ? (
            <span className="text-sm text-gray-500">{place.startTime}</span>
          ) : (
            <TimeScrollPicker value={place.startTime} onChange={(v) => onTimeChange(place.id, 'startTime', v)} />
          )}
          <span className="text-gray-400 text-sm">&#x2192;</span>
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
        {todayHours && <p className="text-sm text-gray-500 mt-0.5">今日 {todayHours}</p>}
        {place.rating && <p className="text-sm text-gray-500 mt-0.5">評分：{place.rating} &#x2605;</p>}
        {descriptionText && <p className="text-sm text-gray-600 mt-2 italic">{descriptionText}</p>}
        {place.lateExit && <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 結束時間超出營業時間</p>}
      </div>
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
    </>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/card-content.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/CardContent.tsx __tests__/card-content.test.tsx
git commit -m "feat(timeline): shared CardContent with dateIso (getHoursForDate)"
```

---

### Task 3: `components/TimelineCard.tsx`（高度 + 下緣 resize，含 `dateIso`）

**Files:**
- Create: `components/TimelineCard.tsx`
- Test: `__tests__/timeline-card.test.tsx`

**Interfaces:**
- Consumes: `CardContent` (Task 2, needs `dateIso`); `pxToDuration`, `PX_PER_MIN`, `MIN_CARD_PX` (Task 1); `TYPE_META`; `useSortable`/`CSS`; `ScheduledPlace`, `PlaceType`.
- Produces: `TimelineCard({ place, index, dateIso, draggable?, onTimeChange?, onToggleStartLock?, onToggleDurationLock?, onChangeType? })` — height = `max(durationMin*PX_PER_MIN, MIN_CARD_PX)`; bottom resize handle (pointer drag → `onTimeChange(id,'durationMin',n)`); `durationLocked` hides handle (shows 🔒); drag handle disabled when `startLocked`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/timeline-card.test.tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { TimelineCard } from '@/components/TimelineCard'
import type { ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
}))

function place(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: 'a', placeId: 'pid', name: '故宮', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

test('renders content and a resize handle when unlocked', () => {
  render(<TimelineCard place={place()} index={0} dateIso="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByTestId('resize-handle-a')).toBeInTheDocument()
})

test('durationLocked hides resize handle, shows lock mark', () => {
  render(<TimelineCard place={place({ durationLocked: true })} index={0} dateIso="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.queryByTestId('resize-handle-a')).not.toBeInTheDocument()
  expect(screen.getByTestId('duration-locked-mark')).toBeInTheDocument()
})

test('drag bottom edge down lengthens duration via onTimeChange', () => {
  const onTimeChange = jest.fn()
  render(<TimelineCard place={place({ durationMin: 60 })} index={0} dateIso="2026-06-29" draggable onTimeChange={onTimeChange} />)
  const handle = screen.getByTestId('resize-handle-a')
  fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(handle, { clientY: 136, pointerId: 1 }) // +36px /1.2 = +30min
  fireEvent.pointerUp(handle, { clientY: 136, pointerId: 1 })
  expect(onTimeChange).toHaveBeenCalledWith('a', 'durationMin', 90)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/timeline-card.test.tsx`
Expected: FAIL — cannot find module `@/components/TimelineCard`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/TimelineCard.tsx
'use client'
import { useState, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CardContent } from './CardContent'
import { pxToDuration, PX_PER_MIN, MIN_CARD_PX } from '@/lib/utils/timeline'
import { TYPE_META } from '@/lib/placeType'
import type { PlaceType, ScheduledPlace } from '@/lib/types'

interface Props {
  place: ScheduledPlace
  index: number
  dateIso: string
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
}

export function TimelineCard({ place, index, dateIso, draggable, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable || place.startLocked })
  const [previewDur, setPreviewDur] = useState<number | null>(null)
  const startRef = useRef<{ y: number; dur: number } | null>(null)

  const dur = previewDur ?? place.durationMin
  const heightPx = Math.max(dur * PX_PER_MIN, MIN_CARD_PX)
  const meta = TYPE_META[place.type]

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    height: `${heightPx}px`,
  }

  const onResizeDown = (e: ReactPointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    startRef.current = { y: e.clientY, dur: place.durationMin }
    setPreviewDur(place.durationMin)
  }
  const onResizeMove = (e: ReactPointerEvent) => {
    if (!startRef.current) return
    e.stopPropagation()
    setPreviewDur(pxToDuration(startRef.current.dur, e.clientY - startRef.current.y))
  }
  const onResizeUp = (e: ReactPointerEvent) => {
    if (!startRef.current) return
    e.stopPropagation()
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
    const finalDur = pxToDuration(startRef.current.dur, e.clientY - startRef.current.y)
    startRef.current = null
    setPreviewDur(null)
    if (finalDur !== place.durationMin) onTimeChange?.(place.id, 'durationMin', finalDur)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative border rounded-xl p-3 overflow-hidden ${meta.cardBg} ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
      data-testid={`timeline-card-${place.id}`}
    >
      <div className="flex items-start gap-2 h-full">
        {draggable && !place.startLocked && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-0.5 select-none"
            data-testid="drag-handle"
          >&#x2807;</span>
        )}
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
        <CardContent
          place={place}
          dateIso={dateIso}
          onTimeChange={onTimeChange}
          onToggleStartLock={onToggleStartLock}
          onToggleDurationLock={onToggleDurationLock}
          onChangeType={onChangeType}
        />
      </div>
      {place.durationLocked ? (
        <span className="absolute bottom-0 right-2 text-[10px] text-gray-400 select-none" data-testid="duration-locked-mark">🔒</span>
      ) : (
        <div
          role="separator"
          aria-label="拖曳調整停留時間"
          data-testid={`resize-handle-${place.id}`}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-blue-200/50"
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/timeline-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/TimelineCard.tsx __tests__/timeline-card.test.tsx
git commit -m "feat(timeline): TimelineCard with bottom-edge resize + dateIso"
```

---

### Task 4: `components/TimelineDay.tsx`（與 ItineraryDay 完整對齊 + 時間軸版面）

**Files:**
- Create: `components/TimelineDay.tsx`
- Test: `__tests__/timeline-day.test.tsx`

**Interfaces:**
- Consumes: `TimelineCard` (Task 3, needs `dateIso`); `timelineLayout`, `rulerTicks` (Task 1); `buildDayEmbedUrl` (`@/lib/utils/mapUrl`); `dayDate`, `formatDateLabel` (`@/lib/utils/date`); `useDroppable` (@dnd-kit/core); `DayItinerary`, `TransportMode`, `PlaceType`.
- Produces: `TimelineDay(props)` — props **identical to current `components/ItineraryDay.tsx`**. Renders: date-label header (or 超出行程 when `isOverflow`), `isOverflow` scatter/delete buttons, `onChangeWindow` 活動時間窗編輯, 整天鎖, aiSummary, 左刻度 + flow `TimelineCard` 串（含旅行空檔連接線）+ sticky 地圖; droppable id `day-${dayIdx}`. 每天 `dateIso = dayDate(startDate, day.day)`，傳給每張 `TimelineCard`。

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/timeline-day.test.tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { TimelineDay } from '@/components/TimelineDay'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/core', () => ({ useDroppable: () => ({ setNodeRef: () => {}, isOver: false }) }))
jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
}))

function sp(over: Partial<ScheduledPlace>): ScheduledPlace {
  return {
    id: 'a', placeId: 'pid', name: 'X', type: 'attraction', lat: 25.03, lng: 121.56, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

const day: DayItinerary = {
  day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
  places: [
    sp({ id: 'a', name: '故宮', startTime: '09:00', durationMin: 60, travelMinToNext: 20 }),
    sp({ id: 'b', name: '餐廳', type: 'restaurant', startTime: '10:20', durationMin: 90 }),
  ],
}

test('renders place names, a ruler hour label and the day header', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" startDate="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByText('餐廳')).toBeInTheDocument()
  expect(screen.getByText('10:00')).toBeInTheDocument()        // ruler tick
  expect(screen.getByText(/第 1 天/)).toBeInTheDocument()       // header with date label
})

test('renders a travel-gap connector between stops', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" startDate="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByTestId('travel-gap-a')).toBeInTheDocument()
  expect(screen.getByText(/20 分鐘/)).toBeInTheDocument()
})

test('window editor renders when onChangeWindow provided', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" startDate="2026-06-29" draggable onChangeWindow={jest.fn()} />)
  expect(screen.getByText('活動')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/timeline-day.test.tsx`
Expected: FAIL — cannot find module `@/components/TimelineDay`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// components/TimelineDay.tsx
'use client'
import { useDroppable } from '@dnd-kit/core'
import { TimelineCard } from './TimelineCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import { dayDate, formatDateLabel } from '@/lib/utils/date'
import { timelineLayout, rulerTicks } from '@/lib/utils/timeline'
import type { DayItinerary, TransportMode, PlaceType } from '@/lib/types'

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

interface Props {
  day: DayItinerary
  dayIdx: number
  mode: TransportMode
  startDate: string
  isDragging?: boolean
  draggable?: boolean
  isOverflow?: boolean
  onScatter?: () => void
  onDelete?: () => void
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
  onSetDayStartLock?: (locked: boolean) => void
  onSetDayDurationLock?: (locked: boolean) => void
  onChangeWindow?: (field: 'dayStart' | 'dayEnd', value: string) => void
}

export function TimelineDay({ day, dayIdx, mode, startDate, isDragging, draggable, isOverflow, onScatter, onDelete, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType, onSetDayStartLock, onSetDayDurationLock, onChangeWindow }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIdx}` })
  const dateIso = dayDate(startDate, day.day)
  const layout = timelineLayout(day.places)
  const ticks = rulerTicks(layout.dayStartMin, layout.dayEndMin)

  return (
    <section className="mb-12" data-testid={`day-${dayIdx}`}>
      <h2 className="text-xl font-bold text-gray-800 mb-1">
        第 {day.day} 天 · {isOverflow ? '超出行程' : formatDateLabel(dateIso)}
      </h2>
      {isOverflow && (onScatter || onDelete) && (
        <div className="flex gap-2 mb-2">
          {onScatter && (
            <button type="button" onClick={onScatter} className="text-xs px-2 py-1 rounded-full border border-orange-300 text-orange-700 hover:bg-orange-50">散到其他天</button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete} className="text-xs px-2 py-1 rounded-full border border-red-300 text-red-600 hover:bg-red-50">刪除這天</button>
          )}
        </div>
      )}
      {onChangeWindow && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          <span>活動</span>
          <input type="time" value={day.dayStart} onChange={(e) => onChangeWindow('dayStart', e.target.value)} className="border border-gray-200 rounded px-1 py-0.5" />
          <span>&#x2013;</span>
          <input type="time" value={day.dayEnd} onChange={(e) => onChangeWindow('dayEnd', e.target.value)} className="border border-gray-200 rounded px-1 py-0.5" />
          <span>（{((toMin(day.dayEnd) - toMin(day.dayStart)) / 60).toFixed(1)} 小時）</span>
        </div>
      )}
      {(onSetDayStartLock || onSetDayDurationLock) && (() => {
        const has = day.places.length > 0
        const allStart = has && day.places.every((p) => p.startLocked)
        const allDur = has && day.places.every((p) => p.durationLocked)
        return (
          <div className="flex gap-2 mb-2">
            {onSetDayStartLock && (
              <button type="button" disabled={!has} onClick={() => onSetDayStartLock(!allStart)} className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">{allStart ? '🔒' : '🔓'} 整天鎖開始</button>
            )}
            {onSetDayDurationLock && (
              <button type="button" disabled={!has} onClick={() => onSetDayDurationLock(!allDur)} className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">{allDur ? '🔒' : '🔓'} 整天鎖停留</button>
            )}
          </div>
        )
      })()}
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="flex gap-6 items-start">
        <div ref={setNodeRef} className={`flex-1 rounded-lg transition-colors min-h-[60px] ${isOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}>
          <div className="flex">
            <div className="relative w-12 shrink-0" style={{ height: `${layout.totalPx}px` }}>
              {ticks.map((t) => (
                <div key={t.min} className="absolute left-0 right-1 text-[10px] text-gray-400 -translate-y-1/2" style={{ top: `${t.topPx}px` }}>{t.label}</div>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              {day.places.map((place, i) => {
                const cl = layout.cards[i]
                return (
                  <div key={place.id}>
                    <TimelineCard
                      place={place}
                      index={i}
                      dateIso={dateIso}
                      draggable={draggable}
                      onTimeChange={onTimeChange}
                      onToggleStartLock={onToggleStartLock}
                      onToggleDurationLock={onToggleDurationLock}
                      onChangeType={onChangeType}
                    />
                    {cl.travelMin > 0 && (
                      <div className="relative flex items-center justify-center" style={{ height: `${cl.travelGapPx}px` }} data-testid={`travel-gap-${place.id}`}>
                        <div className="absolute inset-x-4 border-t border-dashed border-gray-300" />
                        <span className="relative bg-white px-2 text-xs text-gray-400">&#x2192; {cl.travelMin} 分鐘</span>
                      </div>
                    )}
                  </div>
                )
              })}
              {day.places.length === 0 && (
                <div className="min-h-[60px] text-sm text-gray-400 flex items-center justify-center">把地點拖到這天</div>
              )}
            </div>
          </div>
        </div>
        {embedUrl && (
          <div className="w-96 shrink-0 sticky top-4 rounded-xl overflow-hidden border border-gray-200">
            <iframe
              src={embedUrl}
              width="100%"
              height="500"
              style={{ border: 0, pointerEvents: isDragging ? 'none' : 'auto' }}
              loading="lazy"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              title={`第 ${day.day} 天路線地圖`}
            />
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/timeline-day.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full timeline suite + typecheck**

Run: `npx jest __tests__/timeline.test.ts __tests__/card-content.test.tsx __tests__/timeline-card.test.tsx __tests__/timeline-day.test.tsx && npx tsc --noEmit`
Expected: all timeline tests PASS; tsc no NEW errors in the new files (ignore unrelated pre-existing errors elsewhere).

- [ ] **Step 6: Commit**

```bash
git add components/TimelineDay.tsx __tests__/timeline-day.test.tsx
git commit -m "feat(timeline): TimelineDay full-parity with ItineraryDay + timeline layout"
```

---

## Lane A integration (NOT part of this plan — see handoff)

`docs/superpowers/spikes/2026-06-28-timeline-laneA-handoff.md`：Lane A 在 `ItineraryClient.tsx` 加 `viewMode` 切換並依模式渲染 `ItineraryDay`/`TimelineDay`（**props 已逐一相同，可直接二選一渲染**）；之後把 `ItineraryCard.tsx` 重構成使用 `CardContent`（需傳 `dateIso`）。整合後做 UAT。

---

## Self-Review

**1. Spec coverage：** `timeline.ts`→T1✓；`CardContent`(含 dateIso)→T2✓；`TimelineCard`(resize + dateIso、durationLocked 不可 resize)→T3✓；`TimelineDay`(props 與當前 ItineraryDay 逐一相同、日期標籤/overflow scatter+delete/活動時間窗/整天鎖/旅行空檔/地圖)→T4✓；順序 reflow 沿用 recalcPlan、不改排程→resize 只送 onTimeChange('durationMin')✓；Lane A 整合排除→handoff✓。

**2. Placeholder scan：** 無 TBD/TODO；每步含完整程式碼與指令。✓

**3. Type consistency：** `dateIso: string` 由 CardContent→TimelineCard→TimelineDay 一致下傳；`getHoursForDate(openingHours, dateIso)`（非 getTodayHours）；`TimelineDay` props == 當前 `ItineraryDay` props（逐一列出，含 startDate/isOverflow/onScatter/onDelete/onChangeWindow）；testid `resize-handle-${id}`/`duration-locked-mark`/`travel-gap-${id}` 元件與測試一致；`day.dayStart`/`day.dayEnd` 用於活動時間窗。✓
