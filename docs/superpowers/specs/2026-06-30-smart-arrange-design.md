# 智慧排程（每天獨立重排）Design Spec

**日期：** 2026-06-30
**子專案：** #7（roadmap 12 需求 → 9 子專案中的第 7 項，對應原始需求 req 6 + req 8 的 auto 部分）
**依賴：** #2 行程日曆（dayStart/dayEnd、每天日期）✅、#3 住宿排程 ✅、#5 拆分時間鎖 ✅、#9 crowd-data 層 ✅（已併入 main）
**狀態：** 設計定稿，待寫 plan

---

## 1. 目標

在每天的標頭提供一顆「智慧排程」按鈕 + 兩個勾選框（避開壅塞 / 避開人潮）。按下後**只重排那一天**未鎖定地點的順序，使「移動時間 + 人潮等待」總成本最低。鎖定地點當錨點不動、停留時長不變、不跨天搬移、不壓縮也不插入，**空閒時間原樣保留**。

### 非目標（明確排除）
- 不跨天搬移地點（每天獨立；跨天最佳化不在範圍）。
- 不改變任何地點的停留時長（`durationMin`）。
- 不壓縮空閒時間、不主動插入推薦景點（空閒時間保留原樣；主動填空屬未來子專案）。
- 不顯示空閒時間區塊（那是 #6，獨立子專案）。
- 不做交通尖峰（rush-hour／departure_time）感知路由（本案的「避開壅塞」= 最小化移動時間，非時段交通）。

---

## 2. 行為總覽

1. 使用者在某天標頭勾選「避開壅塞」「避開人潮」（預設兩者皆開），按「智慧排程」。
2. 系統取得該天所需資料（距離矩陣；若勾避人潮，再取各站 crowd 預測），在客戶端跑決定性局部搜尋，找出未鎖定站的最佳順序。
3. 套用新順序後，以既有 `recalcDay` 權威重算各站時間與營業時間警告。
4. 非同步期間按鈕顯示 loading；資料取得失敗則提示並保留原順序。

「鎖定當錨點」定義：
- `startLocked` 的站 → 釘在其原本的 `startTime`，且其在序列中的位置固定（不被重排移動）。
- `durationLocked` 的站 → 停留時長不變（本案本就不改任何站的時長，故此鎖在重排中無額外作用，但仍照常顯示）。
- 一天全部站皆 `startLocked` → 無可重排，按鈕停用。

---

## 3. 架構

職責拆兩塊，讓「時序模擬」只有單一來源（沿用 `lib/utils/clientScheduler`），並讓最佳化邏輯成為可單元測試的純函式。

### 3.1 伺服器動作（薄資料層）
**新檔 `app/actions/arrange.ts`**
```ts
export async function fetchDayArrangeInputs(
  dayPlaces: Place[],
  mode: TransportMode,
  needCrowd: boolean
): Promise<DayArrangeInputs>
```
- 內部呼叫既有 `buildDistanceMatrix(dayPlaces, mode)`（Google 距離矩陣，掛了或 >25 站則 haversine fallback，單位秒）。
- 僅當 `needCrowd === true` 才平行呼叫既有 `getCrowdForecast(place)`（BestTime → heuristic fallback，含 14 天/1 天 TTL 快取）取每站預測；否則 `crowdByPlaceId` 回空物件。
- 回傳型別：
```ts
interface DayArrangeInputs {
  indices: string[]                              // placeId 對矩陣列的對應
  matrix: number[][]                             // 秒
  crowdByPlaceId: Record<string, CrowdForecast>  // 只含成功取得的站；其餘視為無資料
}
```
- 不做任何排序或時序計算——純資料取得。

### 3.2 客戶端純模組（最佳化）
**新檔 `lib/utils/arrangeDay.ts`**
```ts
interface ArrangeOpts { avoidTraffic: boolean; avoidCrowds: boolean }

// 主入口：回傳重排後（仍未重算時間）的當天 places
export function arrangeDayOrder(
  day: DayItinerary,
  dateIso: string,
  inputs: DayArrangeInputs,
  opts: ArrangeOpts
): ScheduledPlace[]
```
- 用既有 `lib/tsp` 的局部搜尋結構（2-opt + 相鄰 swap），但**評分函式換成本案的 `cost(order)`**（見 §4），因為人潮成本依賴模擬時序、非靜態邊成本。
- 鎖定（`startLocked`）的站在搜尋中固定於其原索引，不參與重排。
- **回傳前更新 `travelMinToNext`**：每站的 `travelMinToNext` 依「新順序的相鄰站」從距離矩陣重算（原本的值反映舊順序、已失效）。如此後續 `recalcDay` 與卡片「前往下一站約 X 分鐘」皆正確。
- 決定性：無 `Math.random` / `Date.now`；平手以 `placeId` 字典序打破。

**共用時序模擬 `simulateTimes()`（重構抽出）**
```ts
export function simulateTimes(
  orderedPlaces: ScheduledPlace[],
  dayStart: string,
  travelMins: number[]   // 第 i 站到第 i+1 站的移動分鐘（長度 = places.length，最後一項忽略）
): number[]              // 各站 startTime 的「當天分鐘數」
```
- 從 `dayStart` 出發，依序累加 `durationMin + travelMins[i]`；遇 `startLocked` 站釘在其 `startTime`。
- **移動時間以參數傳入、不從 `travelMinToNext` 讀**：這是關鍵——搜尋中每個候選順序的相鄰關係不同，移動時間必須對應候選順序。
  - `recalcDay` 呼叫時，`travelMins[i] = orderedPlaces[i].travelMinToNext ?? 0`（既有順序，行為不變）。
  - `arrangeDayOrder` 評分某候選順序時，`travelMins[i]` = 該候選相鄰兩站在距離矩陣中的秒數 ÷ 60。
- 由 `recalcDay` 與 `arrangeDayOrder` 的評分**共用同一份**，避免兩處時序邏輯分歧。
- 重構手法：把 `recalcDay` 現有的「依鎖定錨點推算開始時間」邏輯抽成此函式（移動時間改由呼叫端備好傳入）；`recalcDay` 改為呼叫它再補警告，行為不變（既有測試需全綠）。

### 3.3 串接（ItineraryClient）
- 新增 handler `onSmartArrange(dayIdx: number)`：
  1. 取該天未全鎖 → 否則直接 return。
  2. `await fetchDayArrangeInputs(dayPlaces, plan.transportMode, day.avoidCrowds ?? true)`。
  3. `const reordered = arrangeDayOrder(day, dateIso, inputs, { avoidTraffic, avoidCrowds })`。
  4. 以 `reordered` 取代該天 `places`，呼叫既有 `recalcDay`/`scheduleRecalc` 權威重算時間。
  5. 更新 plan state。
- loading 狀態：以 `arrangingDayIdx: number | null` 之類的本地 state 控制該天按鈕的 spinner 與停用。
- 錯誤：`fetchDayArrangeInputs` throw 時，顯示提示（繁中），保留原順序，不動 state。

---

## 4. 成本模型

對某候選順序 `order`：
```
cost(order) = wTravel · travelSeconds(order) + wCrowd · crowdPenalty(order)
```
兩項皆以「秒」為單位，可直接相加比較。

### 4.1 交通項
```
travelSeconds(order) = Σ matrix[idx(order[i])][idx(order[i+1])]
```
沿順序加總 §3.1 距離矩陣的邊（秒）。

### 4.2 人潮項
1. 用 `simulateTimes(order, dayStart, travelMins)` 算各站造訪時刻（`travelMins` 由候選順序的相鄰站在距離矩陣中查得，見 §3.2）。
2. 對每站：`level = levelAt(crowdByPlaceId[placeId], weekday(dateIso), visitHour)`（`visitHour` = 模擬 startTime 的整點；`weekday` 由 `dateIso` 取）。
3. 換算虛擬排隊秒數並加總：

| `levelAt` | 懲罰秒數（常數，置於 `arrangeDay.ts` 頂部） |
|---|---|
| `low` | `0` |
| `medium` | `600`（10 分） |
| `high` | `1800`（30 分） |
| `null`（無資料） | `0`（略過、不罰） |

- 跨整點的站只看「抵達當下整點」評分（YAGNI；未來可改跨時段平均）。

### 4.3 權重與勾選框語意

| 勾選狀態 | `wTravel` | `wCrowd` | 效果 |
|---|---|---|---|
| 只「避開壅塞」 | `1.0` | `0` | 純最短路線（傳統 TSP） |
| 只「避開人潮」 | `0.2` | `1.0` | 以避峰為主，仍保留少量交通權重避免荒謬折返路線 |
| 兩者皆勾 | `1.0` | `1.0` | 權重融合，交通與避峰對等權衡 |
| 兩者皆未勾 | — | — | 按鈕**停用**，提示「請至少勾一項」 |

常數集中在 `arrangeDay.ts` 頂部，便於日後微調：
```ts
const CROWD_PENALTY = { low: 0, medium: 600, high: 1800 } as const
const W_TRAVEL_WHEN_CROWD_ONLY = 0.2
```

### 4.4 範例（驗證權重）
週六、三未鎖景點 A/B/C、停留各 60 分、dayStart 09:00。B 上午 10–11 尖峰(high)、午後 low；A 上午 medium；C 整天 low。移動（分）：起點→A 10、A→B 20、B→C 15、A→C 40、C→B 15。

- 順序① A→B→C：交通 2700s、人潮 600+1800+0=2400
- 順序② A→C→B：交通 3900s、人潮 600+0+0=600

| 勾選 | ①成本 | ②成本 | 贏家 |
|---|---|---|---|
| 只避壅塞 | 2700 | 3900 | ① |
| 只避人潮 | 540+2400=2940 | 780+600=1380 | ② |
| 兩者皆勾 | 5100 | 4500 | ② |

---

## 5. 資料模型

`lib/types.ts` 的 `DayItinerary` 新增兩個**可選**欄位：
```ts
avoidTraffic?: boolean   // 預設視為 true（讀取時 ?? true）
avoidCrowds?: boolean    // 預設視為 true
```
- 可選 + 讀取端 `?? true` → **零 fixture 遷移**（既有測試與既有 plan 物件不需改）。
- 由 `DayItinerary` 攜帶 → 每天獨立記住自己的勾選。

新增型別（`DayArrangeInputs`、`ArrangeOpts`）置於使用處或 `lib/types.ts`，依現有慣例。

---

## 6. UI

### 6.1 位置
每天標頭列（`components/ItineraryDay.tsx`，與既有「整天鎖開始 / 整天鎖停留」同區）：
```
☑ 避開壅塞   ☑ 避開人潮   [ 智慧排程 ]
```
- 兩個 checkbox 綁 `day.avoidTraffic ?? true` / `day.avoidCrowds ?? true`，變更透過新 handler 回寫 `DayItinerary`。
- 按鈕：兩者皆未勾 → `disabled` + title 提示「請至少勾一項」；該天全 `startLocked` → `disabled`。
- 進行中 → spinner + 停用（避免重複點擊）。

### 6.2 文案（繁體中文）
- checkbox：「避開壅塞」「避開人潮」
- 按鈕：「智慧排程」；進行中：「排程中…」
- 兩者皆未勾 title：「請至少勾一項」
- 失敗提示：「排程失敗，請稍後再試」（保留原順序）

---

## 7. 元件與職責邊界

| 檔案 | 職責 | 依賴 |
|---|---|---|
| `app/actions/arrange.ts`（新） | `fetchDayArrangeInputs`：取距離矩陣 + 選擇性 crowd | `buildDistanceMatrix`、`getCrowdForecast` |
| `lib/utils/arrangeDay.ts`（新） | `arrangeDayOrder` + 成本模型 + 懲罰常數 | `lib/tsp`、crowd `levelAt`、`simulateTimes` |
| `lib/utils/clientScheduler.ts`（改） | 抽出 `simulateTimes`；`recalcDay` 改為共用它 | — |
| `lib/types.ts`（改） | `DayItinerary.avoidTraffic?/avoidCrowds?`；`DayArrangeInputs`/`ArrangeOpts` | — |
| `components/ItineraryDay.tsx`（改） | 兩 checkbox + 智慧排程按鈕 + loading/disabled | 新 handlers |
| `app/itinerary/ItineraryClient.tsx`（改） | `onSmartArrange`、checkbox 回寫、loading state、錯誤處理 | 上述 |

---

## 8. 錯誤處理與邊界

- **API 全掛**：`buildDistanceMatrix` 自動 haversine fallback（既有行為），故 `fetchDayArrangeInputs` 仍能回矩陣；只有真的 throw 才走錯誤提示路徑。
- **crowd 全無資料**（無 BestTime key 且 heuristic 也回 null 的站）→ 該站人潮懲罰 0，等同只有交通項。
- **全鎖的天 / 0–1 個未鎖站**：無可重排，按鈕停用或 no-op。
- **決定性**：純函式、平手以 placeId 打破，無隨機/時間相依 → 同輸入同輸出（利於測試與快取）。
- **重複點擊**：loading 期間按鈕停用。

---

## 9. 測試策略（TDD）

純函式（最重點，單元測試）：
- `simulateTimes`：無鎖順排；含 `startLocked` 錨點的前後段推算；與 `recalcDay` 重構後一致（既有 recalcDay 測試全綠即證）。
- `crowdPenalty` 換算：low/med/high/null → 0/600/1800/0。
- `arrangeDayOrder`：
  - 只避壅塞 → 等同最短路線（與純 TSP 結果一致）。
  - 只避人潮 → 用造的 crowd 預測讓某序避開尖峰勝出（如 §4.4 順序②）。
  - 兩者皆勾 → §4.4 的權衡（②勝）。
  - 鎖定站固定於原位、其時間不被改。
  - 決定性：同輸入重跑結果相同。

整合（jsdom / mock 伺服器動作）：
- ItineraryClient `onSmartArrange`：mock `fetchDayArrangeInputs` 回固定 inputs → 點按鈕 → 該天順序更新、時間經 recalc。
- loading 狀態：進行中按鈕停用；完成後恢復。
- 錯誤路徑：`fetchDayArrangeInputs` reject → 顯示提示、順序不變。
- checkbox 回寫：勾選變更寫入該天 `DayItinerary`；兩者皆未勾 → 按鈕停用。

既有全測試需保持綠（特別是 `clientScheduler` 重構後的 recalc 行為不變）。

---

## 10. 全域約束

- TypeScript strict，無 `any`。不新增 npm 套件（crowd / 距離矩陣 / TSP 皆既有）。
- UI 文案繁體中文。
- 可選欄位 + 衍生預設 → 零 fixture 遷移。
- 決定性排程（同輸入同輸出）。
- 不動既有無住宿/有住宿排程路徑與既有鎖邏輯之語意。
