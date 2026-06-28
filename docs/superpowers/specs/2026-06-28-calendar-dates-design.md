# 行程日曆日期 + 日期感知營業時間 Design

**Goal:** 為行程加入真實日曆日期：每天對應一個日曆日，營業時間警告用該天**正確的星期**判斷（修掉現行用「今天真實星期」的 bug）；使用者可在首頁與行程頁設定/調整起訖日期，天數隨之增減，縮短時以警告 + 逐天「散到其他天 / 刪除」解決。

**Scope:** 路線圖 **#2**（需求 9、11、12）。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS。**不新增 npm 套件**（日期用原生 `Date` + 自寫 helper）。

---

## 1. 資料模型

- `PlanResult` 新增 `startDate: string`（ISO `YYYY-MM-DD`）。
- 每天的日曆日為**衍生值**：`dayDate(startDate, dayNumber) = startDate + (dayNumber − 1) 天`。不在 `DayItinerary` 另存日期，避免雙重真相。
- 「設定天數 N」= 結束日 − 開始日 + 1。
- `DayItinerary` 新增**每日活動時間窗**（`"HH:MM"`），**每天可獨立調整**，預設 `'09:00'`–`'21:00'`：
  ```typescript
  dayStart: string   // 該天活動開始時間，預設 '09:00'
  dayEnd: string     // 該天活動結束時間，預設 '21:00'
  ```
  - 取代現行寫死的 `DAY_START = 9*60`：排程以該天 `dayStart` 為起始游標。
  - 衍生 **`DAY_BUDGET`（給住宿排程 #3）= `dayEnd − dayStart`（分鐘）**。
  - 新增天（拉長）時兩值給預設；「散到其他天」併入的地點沿用目標天既有時間窗。

新增 `lib/utils/date.ts`（純函式，無相依）：
```typescript
export function addDays(iso: string, n: number): string        // 'YYYY-MM-DD' + n 天
export function dayDate(startDate: string, dayNumber: number): string  // startDate + (dayNumber-1)
export function weekdayIndex(iso: string): number              // 0=Mon..6=Sun（Monday-first，配合 openingHours 陣列）
export function formatDateLabel(iso: string): string           // '6/30（一）'
export function daysBetween(startIso: string, endIso: string): number // 含頭尾天數
```
> `weekdayIndex` 以本地午夜解析（`new Date(y, m-1, d)`）避免 UTC 位移；輸出 Monday-first 索引，對齊 `openingHours`（`["Monday: …", …]`）。

---

## 2. 設定起訖（首頁 `app/page.tsx`）

- 把現在的「天數」數字框，改成 **開始日期 + 結束日期** 兩個 `<input type="date">`。
- 天數自動算出並顯示（`daysBetween`）；結束日不可早於開始日（早於則自動設為開始日、天數=1）。
- 預設：開始 = 今天、結束 = 今天 + 1（共 2 天，沿用現行預設）。
- 送出時帶 `start`（ISO）與 `days` 到行程頁：`/itinerary?start=YYYY-MM-DD&days=N&mode=…`。

`app/itinerary/ItineraryInner.tsx`：讀 `start`（預設今天）與 `days`；`planItinerary(places, days, mode, start)` 產生帶 `startDate` 的 `PlanResult`。

---

## 3. 行程頁顯示與調整（需求 9、11）

### 3a. 頂部起訖列（`ItineraryClient`）
- 顯示 **「開始日 – 結束日（共 N 天）」**，開始日與結束日各為可編輯 `<input type="date">`。
- **目標天數 N** = `daysBetween(開始日, 結束日)`（使用者輸入的目標）；**容器天數 M** = `plan.days.length`（實際 day container 數）。兩者可能短暫不一致：
  - **編輯開始日**：整個行程平移、**長度 N 不變**（結束日同步往後/前移），內容不變（見 §4）。
  - **編輯結束日**：改變 N。N > M → 立即補空白天使 M = N；N < M → 不刪改，靠 §4 警告 + 逐天解決把 M 降到 ≤ N。
- 「共 N 天」顯示使用者目標 N；當 M > N（未解決）時，多出的容器天以 §3b/§4 的「超出」標記呈現。

### 3b. 每天標頭（`components/ItineraryDay.tsx`）
- 顯示該天日期＋星期：**「第 3 天 · 6/30（一）」**（`formatDateLabel(dayDate(startDate, day))`）。
- 超出設定天數的天（見 §4）：標頭顯示「第 X 天 · 超出行程」而非日期。

### 3c. 每日活動時間窗（`components/ItineraryDay.tsx`）
- 每天標頭提供可編輯的**活動起訖時間**（`dayStart`/`dayEnd`，預設 09:00–21:00），**每天獨立**，例：「活動 09:00–21:00（13.0 小時）」。用 `<input type="time">` 或既有 `TimeScrollPicker`。
- 編輯某天 `dayStart`：該天重新從新起始時間 `scheduleForward`（**只重算該天時間，不 re-plan、不跨天**）；`dayEnd` 僅作為 `DAY_BUDGET` 上界與「超出當天結束」判斷。
- `dayEnd` 早於 `dayStart` 視為無效，回退為預設或 `dayStart`。
- 此時間窗驅動住宿排程 #3 的 `DAY_BUDGET = dayEnd − dayStart`，並取代排程中寫死的 9:00 起始。

---

## 4. 調整天數＝前端結構調整（不 re-plan，保留手動安排）

所有調整都在 client（`ItineraryClient`）改 `plan` 結構，**不重新 `planItinerary`**。

- **改開始日**：只更新 `plan.startDate`，所有日期平移；天數與內容不變；營業時間警告隨之重算（見 §5）。
- **拉長**（結束日往後 → N 變大、N > M）：在末尾追加 `N − M` 個空白天（`{ day, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }`）。
- **縮短**（結束日往前 → N 變小、N < M）：**不自動刪改任何資料**，改為：
  - 顯示警告 banner：「行程天數（M）大於設定天數（N），請處理超出的天」。
  - 第 N+1 … M 天標記為「超出」，每個超出天**左側**給兩個動作：
    - **散到其他天** → 該天每個地點以 `findClosestDay`（`lib/utils/geo.ts`）塞進**保留天（1…N）中地理最近的那天末尾**；只動這天，其他天不變；散完移除該空天。
    - **刪除** → 移除該天與其所有地點。
  - 逐天解決到 M ≤ N，警告消失。
- 空的超出天（無地點）：可直接刪除，或在 N 縮小時自動移除（無資料損失）。

> 邊界：縮短後若 N ≥ 1 但末尾仍有「超出」天未解決，維持顯示警告，不強制；使用者自行決定。

---

## 5. 日期感知營業時間（修 bug + 需求 12）

`lib/utils/hours.ts`：三個函式改為**接收該天日期**，用該天星期判斷。

```typescript
export function getHoursForDate(openingHours: string[] | null, dateIso: string): string | null
export function checkOutsideHours(startTime: string, openingHours: string[] | null, dateIso: string): boolean
export function checkLateExit(startTime: string, durationMin: number, openingHours: string[] | null, dateIso: string): boolean
```
- 以 `weekdayIndex(dateIso)` 取代 `new Date().getDay()`（這是被修掉的 bug）。
- `app/actions/schedule.ts`：初始排程時，每天用 `dayDate(startDate, dayNumber)` 算各地點的 `outsideHours`/`lateExit`（需把 `startDate` 傳入）。
- `lib/utils/clientScheduler.ts`：若 `recalcDay` 重算 `outsideHours`/`lateExit`，一併改用該天日期（需 `startDate` + day）。
- `components/ItineraryCard.tsx`：接收所屬天的 `dateIso`，`getHoursForDate` 顯示「該日 營業時間」、警告依該日判斷。
- `components/ItineraryDay.tsx`：把該天 `dateIso` 下傳給每張卡片。
- 警告套用到**所有卡片**（含住宿、整天停留的卡片），滿足需求 12。

---

## 6. 不在範圍

- 不因調整天數而重新 `planItinerary`（保留手動安排）。
- 不做時區/多時區處理（單一本地日期）。
- 不持久化到後端（維持現行 sessionStorage + client 狀態）。

---

## 7. Global Constraints

- TypeScript strict，無 `any`。
- 不新增 npm 套件（日期用原生 `Date` + `lib/utils/date.ts`）。
- UI 文案皆為繁體中文。
- 調整天數一律**前端結構調整、不 re-plan**。
- 既有測試需全數通過；新功能以 TDD 補測試。

---

## 8. 變更檔案

| 檔案 | 動作 |
|------|------|
| `lib/utils/date.ts` | 新增：`addDays`/`dayDate`/`weekdayIndex`/`formatDateLabel`/`daysBetween` |
| `lib/types.ts` | `PlanResult` 加 `startDate`；`DayItinerary` 加 `dayStart`/`dayEnd` |
| `lib/utils/hours.ts` | 三函式改為接收 `dateIso`、用該天星期 |
| `app/actions/plan.ts` | `planItinerary` 接收並寫入 `startDate`；每天 `dayStart/dayEnd` 給預設 09:00/21:00 |
| `app/actions/schedule.ts` | 每天用 `dayDate` 算 hours 警告；起始游標用該天 `dayStart`（取代寫死 9:00） |
| `lib/utils/clientScheduler.ts` | 重算 hours 時用該天日期；`scheduleForward` 起點用該天 `dayStart`（取代 `DAY_START` 常數） |
| `app/page.tsx` | 天數框 → 開始/結束日期 picker |
| `app/itinerary/ItineraryInner.tsx` | 讀 `start`、傳入 `planItinerary` |
| `app/itinerary/ItineraryClient.tsx` | 頂部起訖列、調整天數/平移、警告 banner、散到其他天/刪除 handlers；編輯每天活動時間窗 handler（只重算該天） |
| `components/ItineraryDay.tsx` | 標頭顯示日期 + **每天活動起訖時間編輯**；超出天標記 + 左側動作；下傳 `dateIso` |
| `components/ItineraryCard.tsx` | 接收 `dateIso`，hours 顯示/警告依該日 |
| 相關測試 | 既有 hours 測試改傳日期；新增日期/天數調整/散天測試 |

---

## 9. 測試

1. `lib/utils/date.ts`：`addDays`/`dayDate`/`weekdayIndex`（Monday-first）/`formatDateLabel`/`daysBetween` 正確（含跨月）。
2. 日期感知 hours：同一地點、同一 `openingHours`，在「營業的星期」→ `outsideHours=false`；在「公休的星期」→ `outsideHours=true`（釘死原 bug）。
3. 每天標頭顯示正確「第 N 天 · M/D（週）」。
4. 拉長（結束日往後）→ 末尾新增正確數量空白天。
5. 縮短且 M>N → 顯示警告 + 第 N+1…M 天標記「超出」。
6. 「散到其他天」→ 該天地點依 `findClosestDay` 重分配、其他天內容不變、該空天移除。
7. 「刪除」超出天 → 該天與地點移除。
8. 改開始日 → 所有天日期平移、天數與內容不變。
9. 每天 `dayStart`/`dayEnd` 預設 09:00/21:00；新增天沿用預設。
10. 編輯某天 `dayStart` → 只重算該天時間（第一站從新 `dayStart` 起算），其他天不變、不 re-plan。
11. `DAY_BUDGET` 衍生：`dayEnd − dayStart`（分鐘）正確（給住宿排程 #3 消費）。
