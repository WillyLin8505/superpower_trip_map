# 時間軸視圖（Lane B portion）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立時間軸視圖所需的全新、零衝突檔案（純函式 + 三個元件 + 測試），讓 Lane A 之後只需在 `ItineraryClient` 加一個 viewMode 切換即可啟用。

**Architecture:** 純函式 `lib/utils/timeline.ts` 負責版面/resize/刻度數學；`CardContent` 抽出可共用的卡片內容；`TimelineCard` = 高度∝時長 + CardContent + 下緣 resize；`TimelineDay` = 左刻度 + flow 排列卡片（含旅行空檔）+ 地圖，**props 與既有 `ItineraryDay` 完全相同**。順序 reflow 沿用既有 `recalcPlan`，不改排程模型。

**Tech Stack:** Next.js 14、TypeScript strict、@dnd-kit（既有）、原生 Pointer Events（resize）、Jest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-06-28-timeline-view-design.md`（Lane 分工見 §12）

## Global Constraints

- TypeScript strict，**不得用 `any`**。
- **不新增 npm 套件**（resize 用原生 pointer events）。
- **Lane B 只新增檔案**：不得修改 `app/itinerary/ItineraryClient.tsx`、`components/ItineraryCard.tsx`（那是 Lane A 的整合點，見 handoff）。可 `import type` 既有型別、import 既有元件/工具。
- UI 文案繁體中文。
- `TimelineDay` 的 props 必須與 `components/ItineraryDay.tsx` 的 props **逐一相同**（`day, dayIdx, mode, isDragging?, draggable?, onTimeChange?, onToggleStartLock?, onToggleDurationLock?, onChangeType?, onSetDayStartLock?, onSetDayDurationLock?`）。
- 常數：`PX_PER_MIN = 1.2`、`MIN_CARD_PX = 36`、`RESIZE_SNAP_MIN = 5`、`MIN_DURATION_MIN = 5`。
- 測試：`npx jest <path>`。`@/` alias → 專案根。tsx 測試檔首行加 `/** @jest-environment jsdom */`。
- 實作前先把工作分支與 `main` 同步（需要 `ItineraryDay` 最新 props：`onSetDayStartLock/onSetDayDurationLock`）。

---

### Task 1: 純函式 `lib/utils/timeline.ts`

**Files:**
- Create: `lib/utils/timeline.ts`
- Test: `__tests__/timeline.test.ts`

**Interfaces:**
- Consumes: `ScheduledPlace` from `@/lib/types` (type-only).
- Produces:
  - consts `PX_PER_MIN=1.2`, `MIN_CARD_PX=36`, `RESIZE_SNAP_MIN=5`, `MIN_DURATION_MIN=5`
  - `interface TimelineCardLayout { id: string; heightPx: number; travelGapPx: number; travelMin: number }`
  - `interface TimelineLayout { dayStartMin: number; dayEndMin: number; totalPx: number; cards: TimelineCardLayout[] }`
  - `timelineLayout(places: ScheduledPlace[], pxPerMin?: number): TimelineLayout`
  - `pxToDuration(currentDurationMin: number, deltaPx: number, pxPerMin?: number): number`
  - `rulerTicks(dayStartMin: number, dayEndMin: number, pxPerMin?: number): { min: number; topPx: number; label: string }[]`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/timeline.test.ts
import { timelineLayout, pxToDuration, rulerTicks, PX_PER_MIN, MIN_CARD_PX, MIN_DURATION_MIN } from '@/lib/utils/timeline'
import type { ScheduledPlace } from '@/lib/types'

function p(over: Partial<ScheduledPlace>): ScheduledPlace {
  return {
    id: 'x', placeId: 'pid', name: 'X', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

test('empty day → zeroed layout', () => {
  expect(timelineLayout([])).toEqual({ dayStartMin: 0, dayEndMin: 0, totalPx: 0, cards: [] })
})

test('two places: heights, gap, range, totalPx', () => {
  const places = [
    p({ id: 'a', startTime: '09:00', durationMin: 60, travelMinToNext: 20 }),
    p({ id: 'b', startTime: '10:20', durationMin: 90, travelMinToNext: null }),
  ]
  const l = timelineLayout(places)
  expect(l.dayStartMin).toBe(540)            // 09:00
  expect(l.dayEndMin).toBe(620 + 90)         // 10:20 + 90 = 11:50 = 710
  expect(l.cards[0].heightPx).toBe(60 * PX_PER_MIN)
  expect(l.cards[0].travelMin).toBe(20)
  expect(l.cards[0].travelGapPx).toBe(20 * PX_PER_MIN)
  expect(l.cards[1].travelMin).toBe(0)       // last card: no gap
  expect(l.cards[1].travelGapPx).toBe(0)
  expect(l.totalPx).toBeCloseTo(60 * PX_PER_MIN + 20 * PX_PER_MIN + 90 * PX_PER_MIN)
})

test('very short stay floored to MIN_CARD_PX', () => {
  const l = timelineLayout([p({ durationMin: 10 })]) // 10*1.2=12 < 36
  expect(l.cards[0].heightPx).toBe(MIN_CARD_PX)
})

test('pxToDuration snaps to 5 and respects floor', () => {
  expect(pxToDuration(60, 12)).toBe(70)        // +12px /1.2 = +10min → 70
  expect(pxToDuration(60, 5)).toBe(65)         // +5/1.2≈4.17 → snap 5 → 65
  expect(pxToDuration(60, -1000)).toBe(MIN_DURATION_MIN) // floor
})

test('rulerTicks hourly within range', () => {
  const ticks = rulerTicks(540, 710) // 09:00–11:50
  expect(ticks.map((t) => t.label)).toEqual(['10:00', '11:00'])
  expect(ticks[0].topPx).toBe((600 - 540) * PX_PER_MIN)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/timeline.test.ts`
Expected: FAIL — cannot find module `@/lib/utils/timeline`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/utils/timeline.ts
import type { ScheduledPlace } from '@/lib/types'

export const PX_PER_MIN = 1.2
export const MIN_CARD_PX = 36
export const RESIZE_SNAP_MIN = 5
export const MIN_DURATION_MIN = 5

function toMin(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export interface TimelineCardLayout {
  id: string
  heightPx: number
  travelGapPx: number
  travelMin: number
}

export interface TimelineLayout {
  dayStartMin: number
  dayEndMin: number
  totalPx: number
  cards: TimelineCardLayout[]
}

export function timelineLayout(places: ScheduledPlace[], pxPerMin: number = PX_PER_MIN): TimelineLayout {
  if (places.length === 0) {
    return { dayStartMin: 0, dayEndMin: 0, totalPx: 0, cards: [] }
  }
  const dayStartMin = toMin(places[0].startTime)
  const last = places[places.length - 1]
  const dayEndMin = toMin(last.startTime) + last.durationMin
  let totalPx = 0
  const cards = places.map((p, i) => {
    const heightPx = Math.max(p.durationMin * pxPerMin, MIN_CARD_PX)
    const travelMin = i < places.length - 1 ? (p.travelMinToNext ?? 0) : 0
    const travelGapPx = travelMin * pxPerMin
    totalPx += heightPx + travelGapPx
    return { id: p.id, heightPx, travelGapPx, travelMin }
  })
  return { dayStartMin, dayEndMin, totalPx, cards }
}

export function pxToDuration(currentDurationMin: number, deltaPx: number, pxPerMin: number = PX_PER_MIN): number {
  const raw = currentDurationMin + deltaPx / pxPerMin
  const snapped = Math.round(raw / RESIZE_SNAP_MIN) * RESIZE_SNAP_MIN
  return Math.max(MIN_DURATION_MIN, snapped)
}

export function rulerTicks(
  dayStartMin: number,
  dayEndMin: number,
  pxPerMin: number = PX_PER_MIN
): { min: number; topPx: number; label: string }[] {
  const ticks: { min: number; topPx: number; label: string }[] = []
  const first = Math.ceil(dayStartMin / 60) * 60
  for (let m = first; m <= dayEndMin; m += 60) {
    const h = Math.floor(m / 60)
    ticks.push({ min: m, topPx: (m - dayStartMin) * pxPerMin, label: `${String(h).padStart(2, '0')}:00` })
  }
  return ticks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/timeline.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utils/timeline.ts __tests__/timeline.test.ts
git commit -m "feat(timeline): pure layout/resize/ruler helpers"
```

---

### Task 2: 共用內容 `components/CardContent.tsx`

**Files:**
- Create: `components/CardContent.tsx`
- Test: `__tests__/card-content.test.tsx`

**Interfaces:**
- Consumes: `ScheduledPlace`, `PlaceType` (`@/lib/types`); `TYPE_META` (`@/lib/placeType`); `TimeScrollPicker`, `TypePicker`; `getTodayHours` (`@/lib/utils/hours`); `addMinutes` (`@/lib/utils/time`).
- Produces: `CardContent({ place, onTimeChange?, onToggleStartLock?, onToggleDurationLock?, onChangeType? })` — renders the inner content (name/type/start-end pickers/hours/rating/desc/lateExit) + the lock-button column. Renders a React Fragment (no outer card wrapper, no drag handle, no number badge, no travel line — those belong to each card variant).

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
  render(<CardContent place={place()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByText(/世界級博物館/)).toBeInTheDocument()
  expect(screen.getByText(/4\.5/)).toBeInTheDocument()
})

test('lock buttons fire callbacks', () => {
  const onStart = jest.fn()
  const onDur = jest.fn()
  render(<CardContent place={place()} onToggleStartLock={onStart} onToggleDurationLock={onDur} />)
  fireEvent.click(screen.getByLabelText('鎖定開始時間'))
  fireEvent.click(screen.getByLabelText('鎖定停留時間'))
  expect(onStart).toHaveBeenCalledWith('a')
  expect(onDur).toHaveBeenCalledWith('a')
})

test('lateExit warning shown when flagged', () => {
  render(<CardContent place={place({ lateExit: true })} />)
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
import { getTodayHours } from '@/lib/utils/hours'
import { addMinutes } from '@/lib/utils/time'
import type { PlaceType, ScheduledPlace } from '@/lib/types'
import { TYPE_META } from '@/lib/placeType'

interface Props {
  place: ScheduledPlace
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
}

export function CardContent({ place, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType }: Props) {
  const todayHours = getTodayHours(place.openingHours)
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
git commit -m "feat(timeline): shared CardContent (used by TimelineCard; Lane A adopts later)"
```

---

### Task 3: `components/TimelineCard.tsx`（高度 + 下緣 resize）

**Files:**
- Create: `components/TimelineCard.tsx`
- Test: `__tests__/timeline-card.test.tsx`

**Interfaces:**
- Consumes: `CardContent` (Task 2); `pxToDuration`, `PX_PER_MIN`, `MIN_CARD_PX` (Task 1); `TYPE_META` (`@/lib/placeType`); `useSortable`/`CSS` (@dnd-kit); `ScheduledPlace`, `PlaceType`.
- Produces: `TimelineCard({ place, index, draggable?, onTimeChange?, onToggleStartLock?, onToggleDurationLock?, onChangeType? })` — card whose height = `max(durationMin*PX_PER_MIN, MIN_CARD_PX)`; bottom resize handle (pointer drag → `onTimeChange(id,'durationMin',n)`); `durationLocked` hides handle (shows 🔒). Drag handle disabled when `startLocked` (same as list card).

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
  render(<TimelineCard place={place()} index={0} draggable onTimeChange={jest.fn()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByTestId('resize-handle-a')).toBeInTheDocument()
})

test('durationLocked hides resize handle, shows lock mark', () => {
  render(<TimelineCard place={place({ durationLocked: true })} index={0} draggable onTimeChange={jest.fn()} />)
  expect(screen.queryByTestId('resize-handle-a')).not.toBeInTheDocument()
  expect(screen.getByTestId('duration-locked-mark')).toBeInTheDocument()
})

test('drag bottom edge down lengthens duration via onTimeChange', () => {
  const onTimeChange = jest.fn()
  render(<TimelineCard place={place({ durationMin: 60 })} index={0} draggable onTimeChange={onTimeChange} />)
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
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
}

export function TimelineCard({ place, index, draggable, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType }: Props) {
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
git commit -m "feat(timeline): TimelineCard with bottom-edge resize"
```

---

### Task 4: `components/TimelineDay.tsx`（刻度 + flow 排列 + 地圖）

**Files:**
- Create: `components/TimelineDay.tsx`
- Test: `__tests__/timeline-day.test.tsx`

**Interfaces:**
- Consumes: `TimelineCard` (Task 3); `timelineLayout`, `rulerTicks` (Task 1); `buildDayEmbedUrl` (`@/lib/utils/mapUrl`); `useDroppable` (@dnd-kit/core); `DayItinerary`, `TransportMode`, `PlaceType`.
- Produces: `TimelineDay(props)` where props are **identical to `components/ItineraryDay.tsx`**: `{ day, dayIdx, mode, isDragging?, draggable?, onTimeChange?, onToggleStartLock?, onToggleDurationLock?, onChangeType?, onSetDayStartLock?, onSetDayDurationLock? }`. Renders day header + lock-all buttons + left ruler + flow column of `TimelineCard` with travel-gap connectors + sticky map; droppable id `day-${dayIdx}`.

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
  day: 1, aiSummary: null,
  places: [
    sp({ id: 'a', name: '故宮', startTime: '09:00', durationMin: 60, travelMinToNext: 20 }),
    sp({ id: 'b', name: '餐廳', type: 'restaurant', startTime: '10:20', durationMin: 90 }),
  ],
}

test('renders both place names and a ruler hour label', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByText('餐廳')).toBeInTheDocument()
  expect(screen.getByText('10:00')).toBeInTheDocument()      // ruler tick
})

test('renders a travel-gap connector between stops', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByTestId('travel-gap-a')).toBeInTheDocument()
  expect(screen.getByText(/20 分鐘/)).toBeInTheDocument()
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
import { timelineLayout, rulerTicks } from '@/lib/utils/timeline'
import type { DayItinerary, TransportMode, PlaceType } from '@/lib/types'

interface Props {
  day: DayItinerary
  dayIdx: number
  mode: TransportMode
  isDragging?: boolean
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
  onSetDayStartLock?: (locked: boolean) => void
  onSetDayDurationLock?: (locked: boolean) => void
}

export function TimelineDay({ day, dayIdx, mode, isDragging, draggable, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType, onSetDayStartLock, onSetDayDurationLock }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIdx}` })
  const layout = timelineLayout(day.places)
  const ticks = rulerTicks(layout.dayStartMin, layout.dayEndMin)

  return (
    <section className="mb-12" data-testid={`day-${dayIdx}`}>
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {(onSetDayStartLock || onSetDayDurationLock) && (() => {
        const has = day.places.length > 0
        const allStart = has && day.places.every((p) => p.startLocked)
        const allDur = has && day.places.every((p) => p.durationLocked)
        return (
          <div className="flex gap-2 mb-2">
            {onSetDayStartLock && (
              <button type="button" disabled={!has} onClick={() => onSetDayStartLock(!allStart)} className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                {allStart ? '🔒' : '🔓'} 整天鎖開始
              </button>
            )}
            {onSetDayDurationLock && (
              <button type="button" disabled={!has} onClick={() => onSetDayDurationLock(!allDur)} className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                {allDur ? '🔒' : '🔓'} 整天鎖停留
              </button>
            )}
          </div>
        )
      })()}
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="flex gap-6 items-start">
        <div
          ref={setNodeRef}
          className={`flex-1 rounded-lg transition-colors min-h-[60px] ${isOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
        >
          <div className="flex">
            <div className="relative w-12 shrink-0" style={{ height: `${layout.totalPx}px` }}>
              {ticks.map((t) => (
                <div key={t.min} className="absolute left-0 right-1 text-[10px] text-gray-400 -translate-y-1/2" style={{ top: `${t.topPx}px` }}>
                  {t.label}
                </div>
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
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full timeline suite + typecheck**

Run: `npx jest __tests__/timeline.test.ts __tests__/card-content.test.tsx __tests__/timeline-card.test.tsx __tests__/timeline-day.test.tsx && npx tsc --noEmit`
Expected: all timeline tests PASS; tsc no new errors in the new files.

- [ ] **Step 6: Commit**

```bash
git add components/TimelineDay.tsx __tests__/timeline-day.test.tsx
git commit -m "feat(timeline): TimelineDay (ruler + flow layout + travel gaps + map)"
```

---

## Lane A integration (NOT part of this plan — see handoff)

`docs/superpowers/spikes/2026-06-28-timeline-laneA-handoff.md`：Lane A 在 `ItineraryClient.tsx` 加 `viewMode` 切換並依模式渲染 `ItineraryDay`/`TimelineDay`；之後把 `ItineraryCard.tsx` 重構成使用 `CardContent`。整合後做 UAT。

---

## Self-Review

**1. Spec coverage（對照 §11 Lane B 列）：**
- `lib/utils/timeline.ts`（版面/resize/刻度）→ Task 1 ✓
- `CardContent.tsx` → Task 2 ✓
- `TimelineCard.tsx`（高度 + 下緣 resize、durationLocked 不可 resize）→ Task 3 ✓
- `TimelineDay.tsx`（刻度 + flow 排列 + 旅行空檔 + 地圖、props == ItineraryDay）→ Task 4 ✓
- 測試 `timeline.test.ts` / `timeline-card.test.tsx`（+ card-content、timeline-day）→ 各 Task ✓
- 順序 reflow 沿用 recalcPlan、不改排程 → 本 plan 不碰排程，resize 只送 `onTimeChange('durationMin')` ✓
- Lane A 整合（ItineraryClient/ItineraryCard）→ 明確排除，列於 handoff ✓

**2. Placeholder scan：** 無 TBD/TODO；每步含完整程式碼與指令。✓

**3. Type consistency：** `timelineLayout`/`pxToDuration`/`rulerTicks` 簽名與常數（`PX_PER_MIN`/`MIN_CARD_PX`/`MIN_DURATION_MIN`）在 Task 1 定義、Task 3/4 沿用；`CardContent` props ⊂ `TimelineCard` props；`TimelineDay` props == `ItineraryDay` props（逐一列出）。`resize-handle-${id}` / `duration-locked-mark` / `travel-gap-${id}` testid 在元件與測試一致。✓
