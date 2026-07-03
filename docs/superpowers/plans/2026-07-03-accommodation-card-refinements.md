# 住宿卡優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) 一天最後一張是住宿時，停留延到 `dayEnd`（灰色空閒 pill 自動消失）；(B) 住宿 check-in（抵達）早於 15:00 時卡片顯示提醒。

**Architecture:** (A) 在 `recalcDay`（`lib/utils/clientScheduler.ts`）尾端加 `extendLastAccommodation` helper，兩條回傳路徑共用。(B) 在 `components/ItineraryCard.tsx` 加一個純衍生提醒。皆零新欄位。

**Tech Stack:** Next.js 14, TypeScript strict, Jest + Testing Library (jsdom)。

## Global Constraints

- TypeScript strict，無 `any`。不新增 npm 套件。UI 文案繁體中文。
- 純衍生 / 純排程行為 → 零 fixture 遷移。決定性（無隨機/時間相依）。
- 只改 `lib/utils/clientScheduler.ts` + `components/ItineraryCard.tsx`。
- 既有全測試需保持綠（(A) 可能需更新既有含「最後一張住宿」的排程/空閒測試預期）。

---

## Task 1: (A) `recalcDay` 住宿延到 dayEnd

**Files:** Modify `lib/utils/clientScheduler.ts`; Test `__tests__/extend-accommodation.test.ts`

**Interfaces — Produces:** `recalcDay` 行為新增：最後一張若為 `accommodation` 且未 `durationLocked` 且抵達 < `dayEnd` → 其 `durationMin = toMin(dayEnd) − toMin(startTime)`。

- [ ] **Step 1: 失敗測試** — Create `__tests__/extend-accommodation.test.ts`:
```ts
import { recalcPlan } from '@/lib/utils/clientScheduler'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: 0, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function planOf(places: ScheduledPlace[], over: Partial<DayItinerary> = {}): PlanResult {
  return { days: [{ day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', ...over }],
    transportMode: 'driving', startDate: '2026-07-10' }
}
function last(p: PlanResult): ScheduledPlace { return p.days[0].places[p.days[0].places.length - 1] }

it('extends a last accommodation to end at dayEnd', () => {
  // A attraction 09:00 (90min, 0 travel) → H accommodation arrives 10:30; dayEnd 21:00 → duration 630
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('H', { type: 'accommodation', durationMin: 60 })]))
  expect(last(out).startTime).toBe('10:30')
  expect(last(out).durationMin).toBe(630) // 1260 - 630
})
it('does not extend a durationLocked accommodation', () => {
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('H', { type: 'accommodation', durationMin: 60, durationLocked: true })]))
  expect(last(out).durationMin).toBe(60)
})
it('does not extend when arrival is at/after dayEnd', () => {
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('H', { type: 'accommodation', durationMin: 60 })], { dayEnd: '10:00' }))
  expect(last(out).durationMin).toBe(60) // arrival 10:30 >= 10:00 → unchanged
})
it('does not touch a last non-accommodation place', () => {
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('B', { type: 'attraction', durationMin: 90 })]))
  expect(last(out).durationMin).toBe(90)
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest extend-accommodation --silent` → FAIL（住宿未延長）。

- [ ] **Step 3: 實作** — In `lib/utils/clientScheduler.ts`：
  - 檔案已有 `toMin`（top）與 `type ScheduledPlace` import。在 `recalcDay` 之前加 helper：
    ```ts
    function extendLastAccommodation(places: ScheduledPlace[], dayEndMin: number): ScheduledPlace[] {
      if (places.length === 0) return places
      const lastIdx = places.length - 1
      const last = places[lastIdx]
      if (last.type !== 'accommodation' || last.durationLocked) return places
      const startMin = toMin(last.startTime)
      if (startMin >= dayEndMin) return places
      return places.map((p, i) => (i === lastIdx ? { ...p, durationMin: dayEndMin - startMin } : p))
    }
    ```
  - 在 `recalcDay` 內 `const dayStartMin = toMin(day.dayStart)` 之後加 `const dayEndMin = toMin(day.dayEnd)`。
  - 兩條回傳都包上 helper：
    - 無鎖路徑：`return { ...day, places: extendLastAccommodation(scheduleForward(places, dayStartMin, dateIso, dayStartMin), dayEndMin) }`
    - 含鎖路徑（結尾 `return { ...day, places: result }`）：`return { ...day, places: extendLastAccommodation(result, dayEndMin) }`

- [ ] **Step 4: 跑測試 + build** — `npx jest extend-accommodation --silent` PASS（4 tests）；`npx jest --silent` 全綠（若既有 client-scheduler / 空閒 / 住宿排程測試有「最後一張住宿」情境斷言時長或天尾 pill，依新行為更新其預期）；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add lib/utils/clientScheduler.ts __tests__/extend-accommodation.test.ts
git commit -m "feat: extend a day's last accommodation to end at dayEnd (removes trailing free-time pill)"
```

---

## Task 2: (B) 早 check-in 提醒（`ItineraryCard`）

**Files:** Modify `components/ItineraryCard.tsx`; Test `__tests__/itinerary-card-checkin.test.tsx`

- [ ] **Step 1: 失敗測試** — Create `__tests__/itinerary-card-checkin.test.tsx`:
```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'H', placeId: 'H', name: 'H', type: 'accommodation', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '13:00',
    durationMin: 120, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}

it('warns when an accommodation checks in before 15:00', () => {
  render(<ItineraryCard place={sp({ startTime: '13:00' })} index={0} dateIso="2026-07-10" />)
  expect(screen.getByText(/早於一般 check-in 時間（15:00）/)).toBeInTheDocument()
})
it('does not warn when check-in is 15:00 or later', () => {
  render(<ItineraryCard place={sp({ startTime: '15:00' })} index={0} dateIso="2026-07-10" />)
  expect(screen.queryByText(/早於一般 check-in/)).not.toBeInTheDocument()
})
it('does not warn for a non-accommodation place before 15:00', () => {
  render(<ItineraryCard place={sp({ type: 'attraction', startTime: '13:00' })} index={0} dateIso="2026-07-10" />)
  expect(screen.queryByText(/早於一般 check-in/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: 跑確認失敗** — `npx jest itinerary-card-checkin --silent` → FAIL。

- [ ] **Step 3: 實作** — In `components/ItineraryCard.tsx`：
  - 在檔案頂部（import 之後、`interface Props` 之前）加：
    ```ts
    function toMin(t: string): number {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    ```
  - 在既有「停留少於建議」提醒（`{place.durationMin < DWELL[place.type] && (...)}`）之後加：
    ```tsx
    {place.type === 'accommodation' && toMin(place.startTime) < 15 * 60 && (
      <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 早於一般 check-in 時間（15:00）</p>
    )}
    ```

- [ ] **Step 4: 跑測試 + build** — `npx jest itinerary-card-checkin --silent` PASS（3 tests）；`npx jest --silent` 全綠；`npm run build` 成功。

- [ ] **Step 5: Commit**
```bash
git add components/ItineraryCard.tsx __tests__/itinerary-card-checkin.test.tsx
git commit -m "feat: warn when accommodation checks in before 15:00"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §2 (A) → Task1（`extendLastAccommodation` in `recalcDay`，含鎖/邊界）；§3 (B) → Task2（卡片衍生提醒，門檻 15:00）；§7 測試 → 兩 task。
- **零破壞：** 無新欄位；(A) 只在「最後一張住宿且未鎖」時調時長，住宿為末站不影響後續排程；(B) 純衍生。
- **型別一致：** `extendLastAccommodation`、`toMin`（兩檔各自本地）、`recalcDay`/`recalcPlan` 命名一致。
- **既有測試：** (A) 若既有測試有「最後一張住宿」情境，需更新預期（Task1 Step4 已標註）。
