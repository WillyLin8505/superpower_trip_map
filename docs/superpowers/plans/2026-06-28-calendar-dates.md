# 行程日曆日期 + 日期感知營業時間 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為行程加入真實日曆日期（每天對應日曆日 + 每日活動時間窗），讓營業時間警告用該天**正確的星期**判斷（修掉用「今天星期」的 bug），並可在首頁與行程頁設定/調整起訖日、每日時間窗，縮短行程時以警告 + 逐天「散到其他天 / 刪除」解決。

**Architecture:** Task 1 純日期工具。Task 2 加資料模型欄位（`PlanResult.startDate`、`DayItinerary.dayStart/dayEnd`）+ 建立端（plan action、首頁日期 picker）+ 遷移所有 fixtures（hours 暫不變）。Task 3 把 `hours.ts` 改為日期感知 + 排程用每天 `dayStart` 與該天日期（修 bug）。Task 4 行程頁頂部起訖列 + 每天標頭日期/時間窗編輯。Task 5 縮短行程的警告 banner + 散到其他天/刪除。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Jest + Testing Library。**不新增 npm 套件**（日期用原生 `Date` + `lib/utils/date.ts`）。

## Global Constraints

- TypeScript strict，無 `any`。
- 不新增 npm 套件。
- UI 文案皆為繁體中文。
- 調整天數一律**前端結構調整、不重新 `planItinerary`**（保留手動安排）。
- `weekdayIndex` 以本地午夜解析（`new Date(y, m-1, d)`）避免 UTC 位移；Monday-first（0=Mon..6=Sun），對齊 `openingHours`（`["Monday: …", …]`，7 筆 Monday-first）。
- 既有測試需全數通過；新功能以 TDD 補測試。

---

## File Structure

| 檔案 | 責任 |
|------|------|
| `lib/utils/date.ts`（新） | `addDays`/`dayDate`/`weekdayIndex`/`formatDateLabel`/`daysBetween` |
| `lib/types.ts` | `PlanResult` += `startDate`；`DayItinerary` += `dayStart`/`dayEnd` |
| `app/actions/plan.ts` | `planItinerary` 收 `startDate`、寫入 model |
| `app/actions/schedule.ts` | 每天設 `dayStart/dayEnd`；hours 用該天日期；游標起點用 `dayStart` |
| `lib/utils/hours.ts` | 三函式改為接收 `dateIso`、用該天星期 |
| `lib/utils/clientScheduler.ts` | 重算用每天日期 + `dayStart` 起點 |
| `app/page.tsx` | 天數框 → 開始/結束日期 picker |
| `app/itinerary/ItineraryInner.tsx` | 讀 `start`、傳入 `planItinerary` |
| `app/itinerary/ItineraryClient.tsx` | 頂部起訖列、平移/拉長/縮短、散天/刪除、傳 `startDate` 下去 |
| `components/ItineraryDay.tsx` | 標頭日期 + 每日時間窗編輯 + 超出標記/左側動作；下傳 `dateIso` |
| `components/ItineraryCard.tsx` | 收 `dateIso`，hours 依該日 |

**Reused（既有）：** `findClosestDay(days, {lat,lng})`（`lib/utils/geo.ts`）、`minsToTime`/`addMinutes`（`lib/utils/time.ts`）、`recalcPlan`（`lib/utils/clientScheduler.ts`）。

---

## Task 1: 日期工具 `lib/utils/date.ts`

**Files:**
- Create: `lib/utils/date.ts`
- Test: `__tests__/date-utils.test.ts`

**Interfaces:**
- Produces:
  - `addDays(iso: string, n: number): string`
  - `dayDate(startDate: string, dayNumber: number): string`（dayNumber 1-indexed）
  - `weekdayIndex(iso: string): number`（0=Mon..6=Sun）
  - `formatDateLabel(iso: string): string`（`'6/30（一）'`）
  - `daysBetween(startIso: string, endIso: string): number`（含頭尾）

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/date-utils.test.ts`:

```ts
import { addDays, dayDate, weekdayIndex, formatDateLabel, daysBetween } from '@/lib/utils/date'

describe('date utils', () => {
  it('addDays handles month/year crossover', () => {
    expect(addDays('2026-06-29', 3)).toBe('2026-07-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-06-10', 0)).toBe('2026-06-10')
  })
  it('dayDate is 1-indexed from startDate', () => {
    expect(dayDate('2026-06-28', 1)).toBe('2026-06-28')
    expect(dayDate('2026-06-28', 3)).toBe('2026-06-30')
  })
  it('weekdayIndex is Monday-first (0=Mon..6=Sun)', () => {
    expect(weekdayIndex('2026-06-29')).toBe(0) // Monday
    expect(weekdayIndex('2026-06-28')).toBe(6) // Sunday
  })
  it('formatDateLabel shows M/D（週）', () => {
    expect(formatDateLabel('2026-06-29')).toBe('6/29（一）')
    expect(formatDateLabel('2026-06-28')).toBe('6/28（日）')
  })
  it('daysBetween is inclusive of both ends', () => {
    expect(daysBetween('2026-06-28', '2026-06-28')).toBe(1)
    expect(daysBetween('2026-06-28', '2026-06-30')).toBe(3)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest date-utils --silent`
Expected: FAIL — `Cannot find module '@/lib/utils/date'`.

- [ ] **Step 3: 實作**

Create `lib/utils/date.ts`:

```ts
// 全部以「本地午夜」解析 'YYYY-MM-DD'，避免 UTC 位移
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(iso: string, n: number): string {
  const d = parseLocal(iso)
  d.setDate(d.getDate() + n)
  return toIso(d)
}

export function dayDate(startDate: string, dayNumber: number): string {
  return addDays(startDate, dayNumber - 1)
}

// 0=Mon..6=Sun（Monday-first，對齊 openingHours 陣列）
export function weekdayIndex(iso: string): number {
  return (parseLocal(iso).getDay() + 6) % 7
}

const WEEKDAY_TW = ['一', '二', '三', '四', '五', '六', '日']
export function formatDateLabel(iso: string): string {
  const d = parseLocal(iso)
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_TW[weekdayIndex(iso)]}）`
}

export function daysBetween(startIso: string, endIso: string): number {
  const ms = parseLocal(endIso).getTime() - parseLocal(startIso).getTime()
  return Math.floor(ms / 86400000) + 1
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest date-utils --silent` → Expected: PASS（5 tests）。

- [ ] **Step 5: Commit**

```bash
git add lib/utils/date.ts __tests__/date-utils.test.ts
git commit -m "feat: add date utils (addDays/dayDate/weekdayIndex/formatDateLabel/daysBetween)"
```

---

## Task 2: 資料模型欄位 + 建立端 + 首頁日期 picker（hours 暫不變，build 綠燈）

**Files:**
- Modify: `lib/types.ts`, `app/actions/plan.ts`, `app/actions/schedule.ts`, `app/page.tsx`, `app/itinerary/ItineraryInner.tsx`
- Test（fixture 遷移）：`__tests__/itinerary-session.test.tsx`, `__tests__/itinerary-change-type.test.tsx`, `__tests__/itinerary-lock-invariant.test.tsx`, `__tests__/drag-containers.test.ts`, `__tests__/map-url.test.ts`, `__tests__/itinerary-day-embed.test.tsx`, `__tests__/client-scheduler.test.ts`, `__tests__/day-lock-all.test.tsx`, `__tests__/find-closest-day.test.ts`

**Interfaces:**
- Consumes: `daysBetween`, `addDays`（Task 1）。
- Produces:
  - `PlanResult.startDate: string`
  - `DayItinerary.dayStart: string`、`DayItinerary.dayEnd: string`
  - `planItinerary(places, days, mode, startDate): Promise<PlanResult>`

- [ ] **Step 1: 改型別**

In `lib/types.ts`：
- `DayItinerary`（line 28-32）加兩欄：
  ```typescript
  export interface DayItinerary {
    day: number
    places: ScheduledPlace[]
    aiSummary: string | null
    dayStart: string          // "HH:MM" 該天活動開始，預設 '09:00'
    dayEnd: string            // "HH:MM" 該天活動結束，預設 '21:00'
  }
  ```
- `PlanResult`（line 34-37）加 `startDate`：
  ```typescript
  export interface PlanResult {
    days: DayItinerary[]
    transportMode: TransportMode
    startDate: string         // ISO 'YYYY-MM-DD'
  }
  ```

- [ ] **Step 2: plan action 收 startDate、schedule 設每天時間窗**

In `app/actions/schedule.ts`，`schedulePlaces` 回傳的每天物件（line 97）：
```typescript
    return { day: dayIdx + 1, places: scheduled, aiSummary: null }
```
改為：
```typescript
    return { day: dayIdx + 1, places: scheduled, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
```

In `app/actions/plan.ts`：
- 函式簽章（line 9-13）加 `startDate`：
  ```typescript
  export async function planItinerary(
    places: Place[],
    days: number,
    mode: TransportMode,
    startDate: string
  ): Promise<PlanResult> {
  ```
- 回傳（line 31）：
  ```typescript
    return { days: enrichedDays, transportMode: mode, startDate }
  ```
  （`generateDaySummaries` 只改 `aiSummary`，會保留 `dayStart/dayEnd`；無需改 ai.ts。）

- [ ] **Step 3: 首頁日期 picker**

In `app/page.tsx`：
- import 加：`import { daysBetween } from '@/lib/utils/date'`
- 狀態（line 11）`const [days, setDays] = useState(2)` 換成起訖日：
  ```tsx
  const today = new Date()
  const isoToday = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const [startDate, setStartDate] = useState(isoToday)
  const [endDate, setEndDate] = useState(() => {
    const t = new Date(); t.setDate(t.getDate()+1)
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`
  })
  ```
- `handleSubmit`（line 30-34）改帶 `start` + `days`：
  ```tsx
  const handleSubmit = () => {
    if (places.length < 2) return
    const days = Math.max(1, daysBetween(startDate, endDate))
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    router.push(`/itinerary?start=${startDate}&days=${days}&mode=${mode}`)
  }
  ```
- 「天數」`<label>`（line 53-63）整段換成起訖日期 + 唯讀天數：
  ```tsx
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">開始日期</span>
          <input type="date" value={startDate}
            onChange={(e) => {
              const v = e.target.value
              setStartDate(v)
              if (endDate < v) setEndDate(v)
            }}
            className="border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">結束日期</span>
          <input type="date" value={endDate} min={startDate}
            onChange={(e) => setEndDate(e.target.value < startDate ? startDate : e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">天數</span>
          <span className="px-3 py-2">{Math.max(1, daysBetween(startDate, endDate))} 天</span>
        </div>
  ```

- [ ] **Step 4: ItineraryInner 讀 start 並傳入**

In `app/itinerary/ItineraryInner.tsx`，`useEffect` 內（line 27-30）：
```tsx
    const days = Number(searchParams.get('days') ?? 2)
    const mode = (searchParams.get('mode') ?? 'driving') as TransportMode

    planItinerary(places, days, mode).then(setPlan)
```
改為：
```tsx
    const days = Number(searchParams.get('days') ?? 2)
    const mode = (searchParams.get('mode') ?? 'driving') as TransportMode
    const now = new Date()
    const isoToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const start = searchParams.get('start') ?? isoToday

    planItinerary(places, days, mode, start).then(setPlan)
```

- [ ] **Step 5: 遷移 fixtures（純機械）**

- 在**每個建構 `PlanResult` 字面值**的測試（含 `transportMode:`）加 `startDate: '2026-06-01',`：
  `__tests__/itinerary-session.test.tsx`、`__tests__/itinerary-change-type.test.tsx`、`__tests__/itinerary-lock-invariant.test.tsx`、`__tests__/drag-containers.test.ts`、`__tests__/map-url.test.ts`。
- 在**每個建構 `DayItinerary` 字面值**的測試（含 `aiSummary:`）加 `dayStart: '09:00', dayEnd: '21:00',`：
  上述檔案 + `__tests__/itinerary-day-embed.test.tsx`、`__tests__/client-scheduler.test.ts`、`__tests__/day-lock-all.test.tsx`、`__tests__/find-closest-day.test.ts`。
- 任何工廠函式（如 `client-scheduler.test.ts` 的 day 建構與其呼叫 `recalcPlan` 用的 `PlanResult`、`day-lock-all.test.tsx` 的 `day(...)`、`find-closest-day` 的 day 物件）一律補上 `dayStart`/`dayEnd`（與 `PlanResult` 的 `startDate`）。
- **原則 + 安全網：** 凡建構 `PlanResult` 字面值處補 `startDate`、凡建構 `DayItinerary` 字面值處補 `dayStart`/`dayEnd`；上列清單為已知點，`npm run build`（Step 6）會以編譯錯誤抓出任何遺漏，逐一補齊到綠燈。

- [ ] **Step 6: 跑測試 + build**

Run: `npx jest --silent` → Expected: 全數通過。
Run: `npm run build` → Expected: 成功、無 TypeScript 錯誤（所有 `PlanResult`/`DayItinerary` 字面值已補齊新欄位）。

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts app/actions/plan.ts app/actions/schedule.ts app/page.tsx app/itinerary/ItineraryInner.tsx __tests__/
git commit -m "feat: add startDate to PlanResult and per-day dayStart/dayEnd; home date pickers"
```

---

## Task 3: 日期感知營業時間 + 排程用每天日期與 dayStart（修 bug，需求 12）

**Files:**
- Modify: `lib/utils/hours.ts`, `app/actions/schedule.ts`, `lib/utils/clientScheduler.ts`, `components/ItineraryCard.tsx`, `components/ItineraryDay.tsx`, `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/today-hours.test.ts`（改為日期版）, `__tests__/date-aware-hours.test.ts`（新）

**Interfaces:**
- Consumes: `weekdayIndex`, `dayDate`（Task 1）；`PlanResult.startDate`、`DayItinerary.dayStart`（Task 2）。
- Produces:
  - `getHoursForDate(openingHours, dateIso): string | null`
  - `checkOutsideHours(startTime, openingHours, dateIso): boolean`
  - `checkLateExit(startTime, durationMin, openingHours, dateIso): boolean`
  - `ItineraryCard`/`ItineraryDay` 新增 `dateIso` 傳遞。

- [ ] **Step 1: 寫失敗測試（日期感知）**

Create `__tests__/date-aware-hours.test.ts`:

```ts
import { getHoursForDate, checkOutsideHours, checkLateExit } from '@/lib/utils/hours'

// openingHours: Monday-first 7 筆。週一公休、其餘 9:00 AM – 5:00 PM。
const HOURS = [
  'Monday: Closed',
  'Tuesday: 9:00 AM – 5:00 PM',
  'Wednesday: 9:00 AM – 5:00 PM',
  'Thursday: 9:00 AM – 5:00 PM',
  'Friday: 9:00 AM – 5:00 PM',
  'Saturday: 9:00 AM – 5:00 PM',
  'Sunday: 9:00 AM – 5:00 PM',
]

it('getHoursForDate picks the row for that date\'s weekday', () => {
  expect(getHoursForDate(HOURS, '2026-06-30')).toBe('9:00 AM – 5:00 PM') // Tue
  expect(getHoursForDate(HOURS, '2026-06-29')).toBe('休息')               // Mon (Closed)
})

it('checkOutsideHours uses the given date, not today', () => {
  // 14:00 on Tuesday (open) → inside
  expect(checkOutsideHours('14:00', HOURS, '2026-06-30')).toBe(false)
  // 14:00 on Monday (closed) → outside
  expect(checkOutsideHours('14:00', HOURS, '2026-06-29')).toBe(true)
})

it('checkLateExit uses the given date close time', () => {
  // Tue close 17:00; start 16:00 + 90min = 17:30 → late
  expect(checkLateExit('16:00', 90, HOURS, '2026-06-30')).toBe(true)
  expect(checkLateExit('14:00', 60, HOURS, '2026-06-30')).toBe(false)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest date-aware-hours --silent`
Expected: FAIL — 三函式尚未接受 `dateIso`。

- [ ] **Step 3: 改 hours.ts 為日期感知**

Rewrite `lib/utils/hours.ts`（以 `weekdayIndex(dateIso)` 取代 `new Date()`，統一用 Monday-first 索引取列）：

```ts
import { weekdayIndex } from '@/lib/utils/date'

function entryFor(openingHours: string[] | null, dateIso: string): string | null {
  if (!openingHours || openingHours.length === 0) return null
  return openingHours[weekdayIndex(dateIso)] ?? null
}

export function getHoursForDate(openingHours: string[] | null, dateIso: string): string | null {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  if (!rest) return null
  if (/closed|休息|不營業/i.test(rest)) return '休息'
  return rest
}

function getCloseMin(openingHours: string[] | null, dateIso: string): number | null {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  const match = rest.match(/^.+?[–-]\s*(.+)$/)
  if (!match) return null
  const closeStr = match[1].trim()
  const ampm = closeStr.match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = closeStr.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10)
  return null
}

function getOpenMin(openingHours: string[] | null, dateIso: string): number | null {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return null
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  const match = rest.match(/^(.+?)\s*[–-]/)
  if (!match) return null
  const openStr = match[1].trim()
  const ampm = openStr.match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    if (ampm[3].toUpperCase() === 'PM' && h !== 12) h += 12
    if (ampm[3].toUpperCase() === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = openStr.match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10)
  return null
}

export function checkOutsideHours(startTime: string, openingHours: string[] | null, dateIso: string): boolean {
  const entry = entryFor(openingHours, dateIso)
  if (!entry) return false
  if (/closed|休息|不營業/i.test(entry)) return true
  const openMin = getOpenMin(openingHours, dateIso)
  const closeMin = getCloseMin(openingHours, dateIso)
  if (openMin === null || closeMin === null) return false
  const [sh, sm] = startTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  return startMin < openMin || startMin >= closeMin
}

export function checkLateExit(startTime: string, durationMin: number, openingHours: string[] | null, dateIso: string): boolean {
  const closeMin = getCloseMin(openingHours, dateIso)
  if (closeMin === null) return false
  const [h, m] = startTime.split(':').map(Number)
  return h * 60 + m + durationMin > closeMin
}
```

> 行為差異（刻意）：`checkOutsideHours` 現在對「公休日」回傳 `true`（原本找不到 AM/PM 區間就回 false）；這正是需求 12「整天休息也要提醒」。

- [ ] **Step 4: schedule.ts 用每天日期 + dayStart 起點**

In `app/actions/schedule.ts`：
- import 加：`import { dayDate } from '@/lib/utils/date'`
- `schedulePlaces` 簽章加 `startDate: string`（呼叫端 plan.ts 傳入；見下）。
- 每天迴圈內取該天日期：在 `return dayChunks.map((chunk, dayIdx) => {` 之後加 `const dateIso = dayDate(startDate, dayIdx + 1)`。
- 游標起點 `let cursor = DAY_START`（line 60）改為 `let cursor = 9 * 60`（維持 09:00；活動窗的動態起點在 client 端 Task 4 處理，server 初排用預設 09:00）。
- `outsideHours`/`lateExit`（line 81-82）改傳 `dateIso`：
  ```typescript
      const outsideHours = checkOutsideHours(startTime, place.openingHours, dateIso)
      const lateExit = checkLateExit(startTime, durationMin, place.openingHours, dateIso)
  ```

In `app/actions/plan.ts`：`schedulePlaces(ordered, matrix, days)`（line 28）改為 `schedulePlaces(ordered, matrix, days, startDate)`。

- [ ] **Step 5: clientScheduler.ts 用每天日期 + dayStart**

In `lib/utils/clientScheduler.ts`：
- import 加：`import { dayDate } from '@/lib/utils/date'`；移除頂部 `const DAY_START = 9 * 60`。
- `applyWarnings` 改為接收 `dateIso` 與 `dayStartMin`：
  ```typescript
  function applyWarnings(p: ScheduledPlace, startTime: string, startMin: number, dateIso: string, dayStartMin: number): ScheduledPlace {
    return {
      ...p,
      startTime,
      outsideHours: startMin < dayStartMin || checkOutsideHours(startTime, p.openingHours, dateIso),
      lateExit: checkLateExit(startTime, p.durationMin, p.openingHours, dateIso),
    }
  }
  ```
- `scheduleForward`/`scheduleBackwards` 加 `dateIso`、`dayStartMin` 參數並傳給 `applyWarnings`：
  ```typescript
  function scheduleForward(places: ScheduledPlace[], startMin: number, dateIso: string, dayStartMin: number): ScheduledPlace[] {
    let cursor = startMin
    return places.map((p) => {
      const startTime = minsToTime(cursor)
      const result = applyWarnings(p, startTime, cursor, dateIso, dayStartMin)
      cursor += p.durationMin + (p.travelMinToNext ?? 0)
      return result
    })
  }
  function scheduleBackwards(places: ScheduledPlace[], nextStartMin: number, dateIso: string, dayStartMin: number): ScheduledPlace[] {
    let cursor = nextStartMin
    return [...places].reverse().map((p) => {
      const startMin = cursor - p.durationMin - (p.travelMinToNext ?? 0)
      const startTime = minsToTime(Math.max(0, startMin))
      cursor = startMin
      return applyWarnings(p, startTime, startMin, dateIso, dayStartMin)
    }).reverse()
  }
  ```
- `recalcDay` 收 `dateIso`，並把 `DAY_START` 換成 `toMin(day.dayStart)`：
  ```typescript
  function recalcDay(day: DayItinerary, dateIso: string): DayItinerary {
    const places = day.places
    const dayStartMin = toMin(day.dayStart)
    const lockIndices = places.reduce<number[]>((acc, p, i) => (p.startLocked ? [...acc, i] : acc), [])

    if (lockIndices.length === 0) {
      return { ...day, places: scheduleForward(places, dayStartMin, dateIso, dayStartMin) }
    }
    const result: ScheduledPlace[] = [...places]
    const firstLockIdx = lockIndices[0]
    if (firstLockIdx > 0) {
      const leading = places.slice(0, firstLockIdx)
      const scheduled = scheduleBackwards(leading, toMin(places[firstLockIdx].startTime), dateIso, dayStartMin)
      scheduled.forEach((p, i) => { result[i] = p })
    }
    lockIndices.forEach((idx) => {
      const p = places[idx]
      const startTime = p.startTime
      result[idx] = {
        ...p,
        outsideHours: toMin(startTime) < dayStartMin || checkOutsideHours(startTime, p.openingHours, dateIso),
        lateExit: checkLateExit(startTime, p.durationMin, p.openingHours, dateIso),
      }
    })
    lockIndices.forEach((lockIdx, k) => {
      const nextLockPosInList = lockIndices[k + 1]
      const nextLockIdx = nextLockPosInList ?? places.length
      const segment = places.slice(lockIdx + 1, nextLockIdx)
      if (segment.length === 0) return
      const lock = places[lockIdx]
      const lockEndMin = toMin(lock.startTime) + lock.durationMin + (lock.travelMinToNext ?? 0)
      let scheduled = scheduleForward(segment, lockEndMin, dateIso, dayStartMin)
      if (nextLockPosInList !== undefined) {
        const nextLockStartMin = toMin(places[nextLockPosInList].startTime)
        scheduled = scheduled.map(p => {
          const pStartMin = toMin(p.startTime)
          return pStartMin >= nextLockStartMin ? { ...p, outsideHours: true } : p
        })
      }
      scheduled.forEach((p, i) => { result[lockIdx + 1 + i] = p })
    })
    return { ...day, places: result }
  }

  export function recalcPlan(plan: PlanResult): PlanResult {
    return { ...plan, days: plan.days.map((d) => recalcDay(d, dayDate(plan.startDate, d.day))) }
  }
  ```

- [ ] **Step 6: 卡片 + Day 傳遞 dateIso，hours 依該日**

In `components/ItineraryCard.tsx`：
- `import { getTodayHours } from '@/lib/utils/hours'`（line 6）改為 `import { getHoursForDate } from '@/lib/utils/hours'`。
- Props 加 `dateIso: string`（必填）；解構加入。
- `const todayHours = getTodayHours(place.openingHours)`（line 31）改為 `const todayHours = getHoursForDate(place.openingHours, dateIso)`。
- 顯示文案「今日 {todayHours}」改為「{getHoursForDate 結果}」前綴「營業 」（line 95-97 區）：把 `今日 {todayHours}` 改為 `營業 {todayHours}`。

In `components/ItineraryDay.tsx`：
- import 加：`import { dayDate } from '@/lib/utils/date'`
- Props 加 `startDate: string`（必填）；解構加入。
- 在 `<ItineraryCard>`（Task 1 split-lock 後的渲染處）加 `dateIso={dayDate(startDate, day.day)}`。

In `app/itinerary/ItineraryClient.tsx`：
- 每個 `<ItineraryDay ...>`（含 DragOverlay 不需要）加 `startDate={plan.startDate}`。
- `DragOverlay` 內的 `<ItineraryCard>` 加 `dateIso={plan.startDate}`（拖曳幽靈卡，用起始日即可）。

- [ ] **Step 7: 遷移 today-hours 測試**

In `__tests__/today-hours.test.ts`：把所有 `getTodayHours(x)` 改為 `getHoursForDate(x, '2026-06-30')`（週二），並把斷言改為「該日（週二）」對應的營業時間；import 改 `getHoursForDate`。若原測試依賴「今天」的星期，改用固定日期 `'2026-06-30'`（Tue）與 `'2026-06-29'`（Mon, closed）。

- [ ] **Step 7b: 遷移直接渲染元件的測試（補必填 props）**

`dateIso`（`ItineraryCard`）與 `startDate`（`ItineraryDay`）改為必填後，所有**直接**渲染這兩個元件的測試需補上：
- 直接 `render(<ItineraryCard ... />)` 的：`__tests__/split-lock-card.test.tsx`、`__tests__/itinerary-card-info.test.tsx`、`__tests__/itinerary-card-type.test.tsx` — 每個 `<ItineraryCard>` 加 `dateIso="2026-06-30"`。
- 直接 `render(<ItineraryDay ... />)` 的：`__tests__/day-lock-all.test.tsx`、`__tests__/itinerary-day-embed.test.tsx` — 每個 `<ItineraryDay>` 加 `startDate="2026-06-28"`。
- 渲染 `ItineraryClient` 的測試（`itinerary-change-type`、`itinerary-lock-invariant`）**無需**改：`ItineraryClient` 自己用 `plan.startDate` 下傳。

- [ ] **Step 8: 跑測試 + build**

Run: `npx jest date-aware-hours today-hours client-scheduler --silent` → Expected: PASS。
Run: `npx jest --silent` → Expected: 全數通過。
Run: `npm run build` → Expected: 成功。

- [ ] **Step 9: Commit**

```bash
git add lib/utils/hours.ts app/actions/schedule.ts app/actions/plan.ts lib/utils/clientScheduler.ts components/ItineraryCard.tsx components/ItineraryDay.tsx app/itinerary/ItineraryClient.tsx __tests__/date-aware-hours.test.ts __tests__/today-hours.test.ts __tests__/split-lock-card.test.tsx __tests__/itinerary-card-info.test.tsx __tests__/itinerary-card-type.test.tsx __tests__/day-lock-all.test.tsx __tests__/itinerary-day-embed.test.tsx
git commit -m "feat: date-aware opening-hours warnings using each day's real weekday"
```

---

## Task 4: 行程頁頂部起訖列 + 每天標頭日期/活動時間窗編輯

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx`, `components/ItineraryDay.tsx`
- Test: `__tests__/itinerary-date-controls.test.tsx`

**Interfaces:**
- Consumes: `daysBetween`, `addDays`, `dayDate`, `formatDateLabel`（Task 1）；`recalcPlan`。
- Produces:
  - `ItineraryClient`：`handleChangeStartDate(iso)`、`handleChangeEndDate(iso)`、`handleChangeDayWindow(dayIdx, field: 'dayStart' | 'dayEnd', value)`
  - `ItineraryDay` 新增 `onChangeWindow?: (field: 'dayStart' | 'dayEnd', value: string) => void`

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/itinerary-date-controls.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
jest.mock('@/lib/utils/clientScheduler', () => ({
  recalcPlan: jest.fn((p) => p),
}))
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult } from '@/lib/types'

function plan(): PlanResult {
  return {
    startDate: '2026-06-28', transportMode: 'driving',
    days: [
      { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [] },
    ],
  }
}

it('shows the trip start–end range and total day count', () => {
  render(<ItineraryClient initial={plan()} />)
  expect((screen.getByTestId('trip-start-date') as HTMLInputElement).value).toBe('2026-06-28')
  expect((screen.getByTestId('trip-end-date') as HTMLInputElement).value).toBe('2026-06-28')
  expect(screen.getByText(/共 1 天/)).toBeInTheDocument()
})

it('extending the end date appends empty days with default window', async () => {
  render(<ItineraryClient initial={plan()} />)
  const end = screen.getByTestId('trip-end-date')
  fireEvent.change(end, { target: { value: '2026-06-30' } }) // 1 → 3 days
  await waitFor(() => expect(screen.getByText(/共 3 天/)).toBeInTheDocument())
  expect(screen.getByText('第 3 天 · 6/30（二）')).toBeInTheDocument()
})

it('each day header shows its date label and editable activity window', () => {
  render(<ItineraryClient initial={plan()} />)
  expect(screen.getByText('第 1 天 · 6/28（日）')).toBeInTheDocument()
  expect(screen.getByDisplayValue('09:00')).toBeInTheDocument()
  expect(screen.getByDisplayValue('21:00')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest itinerary-date-controls --silent`
Expected: FAIL — 無起訖列、無日期標頭/時間窗。

- [ ] **Step 3: ItineraryClient 頂部起訖列 + handlers**

In `app/itinerary/ItineraryClient.tsx`：
- import 加：`import { daysBetween, addDays, dayDate, formatDateLabel } from '@/lib/utils/date'`
- 在 `handleAddPlaces` 之後新增（平移＝改 startDate 後 `recalcPlan`；拉長＝補空白天）：
  ```tsx
  const handleChangeStartDate = useCallback((iso: string) => {
    const recalced = recalcPlan({ ...planRef.current, startDate: iso })
    planRef.current = recalced
    setPlan(recalced)
  }, [])

  const handleChangeEndDate = useCallback((iso: string) => {
    const start = planRef.current.startDate
    const targetN = Math.max(1, daysBetween(start, iso < start ? start : iso))
    const M = planRef.current.days.length
    if (targetN > M) {
      const extra = Array.from({ length: targetN - M }, (_, k) => ({
        day: M + k + 1, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
      }))
      const newPlan = { ...planRef.current, days: [...planRef.current.days, ...extra] }
      planRef.current = newPlan
      setPlan(newPlan)
    } else {
      // 縮短：不刪改，交由 §5（Task 5）的警告/解決；這裡只記錄目標 N
      setTargetDays(targetN)
    }
  }, [])

  const handleChangeDayWindow = useCallback((dayIdx: number, field: 'dayStart' | 'dayEnd', value: string) => {
    const newDays = planRef.current.days.map((d, i) => i === dayIdx ? { ...d, [field]: value } : d)
    const recalced = recalcPlan({ ...planRef.current, days: newDays })
    planRef.current = recalced
    setPlan(recalced)
  }, [])
  ```
- 新增狀態 `const [targetDays, setTargetDays] = useState<number | null>(null)`（給 Task 5 用；Task 4 先宣告）。
- 計算目前天數與結束日，於頁面頂部（`<a href="/">` 之後、`新增行程` section 之前）插入起訖列：
  ```tsx
      <section className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">開始日期</span>
          <input type="date" data-testid="trip-start-date" value={plan.startDate}
            onChange={(e) => handleChangeStartDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">結束日期</span>
          <input type="date" data-testid="trip-end-date" min={plan.startDate}
            value={dayDate(plan.startDate, plan.days.length)}
            onChange={(e) => handleChangeEndDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <span className="text-sm text-gray-600 pb-1.5">共 {plan.days.length} 天</span>
      </section>
  ```
- `<ItineraryDay>` 加 `onChangeWindow={(field, value) => handleChangeDayWindow(dayIdx, field, value)}`。

- [ ] **Step 4: ItineraryDay 標頭日期 + 時間窗編輯**

In `components/ItineraryDay.tsx`：
- import 已有 `dayDate`、`formatDateLabel`（Task 3 加了 dayDate；補 `formatDateLabel`）。
- Props 加 `onChangeWindow?: (field: 'dayStart' | 'dayEnd', value: string) => void`。
- 標頭 `<h2>`（`第 {day.day} 天`）改為含日期：
  ```tsx
      <h2 className="text-xl font-bold text-gray-800 mb-1">
        第 {day.day} 天 · {formatDateLabel(dayDate(startDate, day.day))}
      </h2>
  ```
- 在標頭下方（Task 2 split-lock 的整天全鎖列附近）加活動時間窗編輯（只在 `onChangeWindow` 提供時顯示）：
  ```tsx
      {onChangeWindow && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          <span>活動</span>
          <input type="time" value={day.dayStart}
            onChange={(e) => onChangeWindow('dayStart', e.target.value)}
            className="border border-gray-200 rounded px-1 py-0.5" />
          <span>–</span>
          <input type="time" value={day.dayEnd}
            onChange={(e) => onChangeWindow('dayEnd', e.target.value)}
            className="border border-gray-200 rounded px-1 py-0.5" />
        </div>
      )}
  ```

- [ ] **Step 5: 跑測試 + build**

Run: `npx jest itinerary-date-controls --silent` → Expected: PASS（3 tests）。
Run: `npx jest --silent` → Expected: 全數通過。
Run: `npm run build` → Expected: 成功。

- [ ] **Step 6: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx components/ItineraryDay.tsx __tests__/itinerary-date-controls.test.tsx
git commit -m "feat: itinerary date range header, per-day date label and activity window editor"
```

---

## Task 5: 縮短行程的警告 + 散到其他天 / 刪除

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx`, `components/ItineraryDay.tsx`
- Test: `__tests__/shorten-resolution.test.tsx`

**Interfaces:**
- Consumes: `findClosestDay`（`lib/utils/geo.ts`）；`recalcPlan`；Task 4 的 `targetDays` 狀態。
- Produces:
  - `ItineraryClient`：`handleScatterDay(dayIdx)`、`handleDeleteDay(dayIdx)`；衍生 `overCount`（= `plan.days.length − N`，N = `targetDays ?? plan.days.length`）。
  - `ItineraryDay` 新增 `isOverflow?: boolean`、`onScatter?: () => void`、`onDelete?: () => void`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/shorten-resolution.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
jest.mock('@/lib/utils/clientScheduler', () => ({ recalcPlan: jest.fn((p) => p) }))
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

function sp(id: string, lat: number, lng: number): ScheduledPlace {
  return { id, placeId: 'g'+id, name: id, type: 'attraction', lat, lng, address: 'a',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false }
}
function plan(): PlanResult {
  return { startDate: '2026-06-28', transportMode: 'driving', days: [
    { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [sp('a', 25.0, 121.5)] },
    { day: 2, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [sp('b', 25.1, 121.6)] },
  ] }
}

it('shows the over-count warning after shortening below populated days', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getByTestId('trip-end-date'), { target: { value: '2026-06-28' } }) // N=1, M=2
  await waitFor(() => expect(screen.getByText(/大於設定天數/)).toBeInTheDocument())
})

it('delete removes the over-count day', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getByTestId('trip-end-date'), { target: { value: '2026-06-28' } })
  await waitFor(() => screen.getByText(/大於設定天數/))
  fireEvent.click(screen.getByRole('button', { name: '刪除這天' }))
  await waitFor(() => expect(screen.queryByText('b')).not.toBeInTheDocument())
})

it('scatter moves the over-count day\'s places into the nearest kept day and removes the day', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getByTestId('trip-end-date'), { target: { value: '2026-06-28' } })
  await waitFor(() => screen.getByText(/大於設定天數/))
  fireEvent.click(screen.getByRole('button', { name: '散到其他天' }))
  // 'b' moved into day 1; only one day remains
  await waitFor(() => expect(screen.queryAllByTestId(/^day-/)).toHaveLength(1))
  expect(screen.getByText('b')).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest shorten-resolution --silent`
Expected: FAIL — 無警告 banner、無散天/刪除按鈕。

- [ ] **Step 3: ItineraryClient 警告 + 散天/刪除 handlers**

In `app/itinerary/ItineraryClient.tsx`：
- import 加：`import { findClosestDay } from '@/lib/utils/geo'`
- 衍生：`const N = targetDays ?? plan.days.length;` `const overCount = Math.max(0, plan.days.length - N);`
- handlers（散天用 `findClosestDay` 把該天每個地點塞進保留天 1..N-1 最近者末尾；散完移除該天；之後 `recalcPlan`）：
  ```tsx
  const renumber = (days: typeof plan.days) => days.map((d, i) => ({ ...d, day: i + 1 }))

  const handleDeleteDay = useCallback((dayIdx: number) => {
    const next = renumber(planRef.current.days.filter((_, i) => i !== dayIdx))
    const recalced = recalcPlan({ ...planRef.current, days: next })
    planRef.current = recalced
    setPlan(recalced)
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
  }, [])

  const handleScatterDay = useCallback((dayIdx: number) => {
    const src = planRef.current.days[dayIdx]
    const kept = planRef.current.days.filter((_, i) => i !== dayIdx)
    let working = kept
    src.places.forEach((p) => {
      const target = findClosestDay(working, p)
      working = working.map((d, i) => i === target ? { ...d, places: [...d.places, { ...p, travelMinToNext: null }] } : d)
    })
    const next = renumber(working)
    const recalced = recalcPlan({ ...planRef.current, days: next })
    planRef.current = recalced
    setPlan(recalced)
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
  }, [])
  ```
- 在起訖列下方，當 `overCount > 0` 顯示警告：
  ```tsx
      {overCount > 0 && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-700">
          行程天數（{plan.days.length}）大於設定天數（{N}），請處理超出的天。
        </div>
      )}
  ```
- `<ItineraryDay>` 加：
  ```tsx
                isOverflow={dayIdx >= N}
                onScatter={() => handleScatterDay(dayIdx)}
                onDelete={() => handleDeleteDay(dayIdx)}
  ```

- [ ] **Step 4: ItineraryDay 超出標記 + 左側動作**

In `components/ItineraryDay.tsx`：
- Props 加 `isOverflow?: boolean`、`onScatter?: () => void`、`onDelete?: () => void`。
- 標頭日期：`isOverflow` 時改顯示「第 N 天 · 超出行程」：
  ```tsx
      <h2 className="text-xl font-bold text-gray-800 mb-1">
        第 {day.day} 天 · {isOverflow ? '超出行程' : formatDateLabel(dayDate(startDate, day.day))}
      </h2>
  ```
- 當 `isOverflow && (onScatter || onDelete)` 時，在卡片區左側（標頭下）加動作列：
  ```tsx
      {isOverflow && (onScatter || onDelete) && (
        <div className="flex gap-2 mb-2">
          {onScatter && (
            <button type="button" onClick={onScatter}
              className="text-xs px-2 py-1 rounded-full border border-orange-300 text-orange-700 hover:bg-orange-50">
              散到其他天
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete}
              className="text-xs px-2 py-1 rounded-full border border-red-300 text-red-600 hover:bg-red-50">
              刪除這天
            </button>
          )}
        </div>
      )}
  ```

- [ ] **Step 5: 跑測試 + build**

Run: `npx jest shorten-resolution --silent` → Expected: PASS（3 tests）。
Run: `npx jest --silent` → Expected: 全數通過。
Run: `npm run build` → Expected: 成功。

- [ ] **Step 6: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx components/ItineraryDay.tsx __tests__/shorten-resolution.test.tsx
git commit -m "feat: shorten-trip warning with per-day scatter-to-nearest or delete"
```

---

## Self-Review Notes

- **Spec 覆蓋：** §1 date.ts + model → Task1/Task2；§2 首頁 picker → Task2；§3a 頂部起訖列 + §3b 每天日期 + §3c 活動時間窗 → Task4；§4 平移/拉長 → Task4，縮短警告 + 散天/刪除 → Task5；§5 日期感知 hours + dayStart 排程 + 卡片 dateIso（含需求 12 公休日提醒）→ Task3；§8/§9 變更檔與測試逐項對應。
- **編譯綠燈：** 加必填 `startDate`/`dayStart`/`dayEnd` 會破壞所有 `PlanResult`/`DayItinerary` 字面值；Task2 在同一任務內補齊所有建構點與 fixtures，故 Task2 結束即綠燈。hours 簽章改動（Task3）會強制所有呼叫端（schedule/clientScheduler/ItineraryCard）同步給 `dateIso`，Task3 一次改完。
- **型別一致：** `startDate`/`dayStart`/`dayEnd`/`dateIso`、`getHoursForDate`/`checkOutsideHours(…,dateIso)`/`checkLateExit(…,dateIso)`、`handleChangeStartDate`/`handleChangeEndDate`/`handleChangeDayWindow`/`handleScatterDay`/`handleDeleteDay`、`onChangeWindow`/`isOverflow`/`onScatter`/`onDelete` 跨 Task 命名一致。
- **不在範圍：** `DAY_BUDGET`（= dayEnd − dayStart）由 #3 住宿排程消費，本計畫只儲存時間窗、不算 budget；時區、後端持久化不做。
