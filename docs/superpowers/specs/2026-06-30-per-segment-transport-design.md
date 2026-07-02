# 行程間交通時間 + 每段交通工具 Design Spec

**日期：** 2026-06-30
**子專案：** #4（roadmap 12 需求 → 9 子專案中的第 4 項，對應原始需求 req 2）
**依賴：** #2 行程日曆 ✅、#7 智慧排程 ✅（共用 2 秒 debounce 重算路徑）
**狀態：** 設計定稿，待寫 plan

---

## 1. 目標

每段（地點 → 下一站）顯示**交通工具 + 時間**，且每段可**個別切換**交通工具。預設依距離自動選最佳：≤500m 步行；>500m 由 Google 實查開車 vs 大眾運輸取最快。結構改變（拖曳/智慧排程/新增/刪除）後 2 秒自動重算受影響的段，但**保留**使用者手動改過、且相鄰關係未變的段。

### 非目標
- 不改變既有「路線排序」演算法（仍用首頁 plan 模式的距離矩陣）。
- 不改變地圖嵌入（仍用 plan 模式畫整天路線）。
- 不做時段交通（尖峰 departure_time）感知。
- 不在拖曳當下同步查交通（一律走 2 秒 debounce，零延遲感）。

---

## 2. 預設模式規則

對每一段（連續兩站 a→b），以 haversine 直線距離（公尺）判定：
```
距離 ≤ 500m  → 步行（walking）
距離 > 500m  → 開車與大眾運輸的 Google 實查時間中，取較快者
```
平手（時間相同）以固定優先序打破：driving 優先（決定性）。

---

## 3. 資料模型

`lib/types.ts` 的 `ScheduledPlace` 新增兩個**可選**欄位：
```ts
legMode?: TransportMode    // 到下一站的交通工具（最後一站 undefined）
legManualNext?: string     // 若有值＝此段為「手動指定」，值為當時下一站的 place.id
```
- `travelMinToNext`（既有）＝ `legMode` 對應的分鐘數。
- 兩欄皆可選 + 衍生讀取 → **零 fixture 遷移**。
- `legManualNext` 是「手動覆寫 + 其有效範圍」的標記：唯有目前的下一站 id 仍等於 `legManualNext` 時，該手動選擇才有效（見 §5.3）。

`lib/haversine.ts` 新增 `haversineMeters(a, b): number`；既有 `haversineSeconds` 改為 `Math.round(haversineMeters(a,b) / 1.4)`（行為不變，純抽取）。用於 500m 門檻判定。

---

## 4. 架構

### 4.1 伺服器動作（`app/actions/legs.ts`，新）
**`computeLegPlan(orderedPlaces: Place[]): Promise<LegDefault[]>`**
```ts
interface LegDefault { legMode: TransportMode; travelMin: number }  // 長度 = places.length - 1
```
- 對排序後的連續每段套用 §2 規則。
- 需要的模式時間來自 `buildDistanceMatrix(orderedPlaces, mode)`（既有；Google → haversine fallback）：建立 walking、driving、transit 三個矩陣（≤25 站，3 次呼叫），每段從對應矩陣讀連續項。
  - 最佳化（可選）：若沒有 ≤500m 段則免建 walking；若沒有 >500m 段則免建 driving/transit。先求正確、再談省呼叫。
- 用於**建立行程**與**結構改變的 2 秒重算**。

**`legDuration(origin: Place, dest: Place, mode: TransportMode): Promise<number>`**
- 單段、單模式：`buildDistanceMatrix([origin, dest], mode)` → `matrix[0][1] / 60` 取整（分鐘）。
- 用於**使用者手動改某段**。

### 4.2 建立行程整合
plan 建立的伺服器流程（排序後、時間填寫時）以 `computeLegPlan(orderedDayPlaces)` 的結果指派每段 `legMode` + `travelMinToNext`（取代目前 `schedule.ts` 以單一模式矩陣填 `travelMinToNext` 的作法）。時間填寫的 cursor 沿用這些 per-段分鐘數，故初始行程即帶 per-段預設工具與時間。

### 4.3 客戶端流程（`ItineraryClient`）
- **手動改某段**（`onChangeLegMode(dayIdx, placeId, mode)`）：找出該站的下一站 → `await legDuration(place, next, mode)` → 設 `legMode=mode`、`travelMinToNext=min`、`legManualNext=next.id` → 重算該天時間。進行中該段顯示 loading；失敗保留原值 + 提示。
- **結構改變後 2 秒重算**：掛在既有 `scheduleRecalc` 的 2 秒 debounce，但**只有結構改變**（拖曳結束、新增、刪除、智慧排程）才觸發 leg 重算；純時間/鎖編輯維持現有純客戶端 recalc、不打 API。重算流程見 §5。

---

## 5. 結構改變後的 2 秒重算（保留手動選擇）

### 5.1 觸發
拖曳結束（含跨天）、新增地點、刪除地點/天、智慧排程完成 → 標記「結構已變」→ 既有 2 秒 debounce 到期時執行 leg 重算（非同步）。拖曳當下僅樂觀更新順序（沿用舊段時間），不打 API → 零延遲感。

### 5.2 流程（逐天，對結構有變的天）
1. `defaults = await computeLegPlan(day.places)`（新順序下每段的預設）。
2. 逐段 merge（place a = `day.places[i]`，b = `day.places[i+1]`）：
   - **保留手動**：若 `a.legManualNext === b.id`（手動段且相鄰未變）→ 保留 `a.legMode` 與 `a.travelMinToNext`（同一對站 → 距離時間不變），保留 `a.legManualNext`。
   - **否則用預設**：`a.legMode = defaults[i].legMode`、`a.travelMinToNext = defaults[i].travelMin`、清掉 `a.legManualNext`。
   - 最後一站：`legMode = undefined`、`travelMinToNext = null`、`legManualNext = undefined`。
3. 以更新後的段時間重算該天時間（既有 recalc）。

### 5.3 手動段的存活語意
- 手動改 a→b 後，`a.legManualNext = b.id`。
- 之後任何結構改變：只要 a 的「目前下一站」仍是 b（id 相同）→ 手動選擇存活；否則（a 改接其他站、或 a 不再有下一站）→ 失效，該段回到預設。
- 例：A→B 手動改大眾；把別天 X 拖到 A、B 之間 → A 的下一站變 X（≠B）→ A→X 用預設、X→B 用預設；B 之後若未變則不受影響。

---

## 6. UI（`ItineraryCard`）

現有「→ 前往下一站約 X 分鐘」改為每段一列：
```
→ 🚗 開車 18 分   [開車 ▾]
```
- 圖示 + 工具名 + 分鐘；右側小型下拉（開車 / 步行 / 大眾運輸）。
- 改選 → 呼叫 `onChangeLegMode`；進行中該列顯示小 loading 文字（「計算中…」），按鈕暫時停用。
- 失敗 → 保留原值，顯示繁中提示（「交通時間計算失敗」）。
- 最後一站無此列（無下一站）。
- 圖示對應：開車 🚗 / 步行 🚶 / 大眾運輸 🚇。

文案（繁中）：開車、步行、大眾運輸、計算中…、交通時間計算失敗。

---

## 7. 邊界與錯誤處理

- **Google API 掛**：`buildDistanceMatrix` 既有 haversine fallback → `computeLegPlan`/`legDuration` 仍回估計時間（步行速度基準）；不額外報錯。
- **真的 throw**（網路/解析）：`legDuration` 失敗 → 保留原值 + 一次性提示（「交通時間計算失敗」）；`computeLegPlan`（2 秒重算）失敗 → 保留舊段時間 + 同一則一次性提示，不破壞行程、不清空既有段。
- **同一對站**（手動段相鄰未變）→ 不重查、直接保留（距離不變）。
- **0–1 站的天**：無段，無動作。
- **決定性**：距離門檻、取最快、平手優先序皆固定 → 同輸入同輸出。

---

## 8. 元件與職責邊界

| 檔案 | 職責 |
|---|---|
| `lib/haversine.ts`（改） | 新增 `haversineMeters`；`haversineSeconds` 改用它（行為不變） |
| `app/actions/legs.ts`（新） | `computeLegPlan`、`legDuration` |
| `lib/types.ts`（改） | `ScheduledPlace.legMode?`、`legManualNext?`；`LegDefault` |
| `app/actions/schedule.ts`（改） | 建立行程時以 `computeLegPlan` 指派 per-段 `legMode`/`travelMinToNext` |
| `lib/utils/legMerge.ts`（新，純） | §5.2 的逐段 merge（保留手動 / 套預設）— 可單元測試 |
| `components/ItineraryCard.tsx`（改） | 每段工具圖示 + 時間 + 下拉 + loading |
| `app/itinerary/ItineraryClient.tsx`（改） | `onChangeLegMode`、結構改變標記 + 2 秒 leg 重算（merge）、loading state |

---

## 9. 測試策略（TDD）

純函式（單元）：
- `haversineMeters`：已知座標距離。
- 500m 門檻 + 取最快（`computeLegPlan` 的核心，抽純函式 `pickLegDefault(distMeters, drivingMin, transitMin, walkingMin)`）：≤500m → 步行；>500m → 較快；平手 → driving。
- `legMerge`（§5.2）：手動段相鄰未變 → 保留；a 接到新站 → 該段用預設、清 `legManualNext`；新出現的相鄰段 → 預設；最後一站清空。

伺服器動作（mock `buildDistanceMatrix`）：
- `computeLegPlan`：建立各模式矩陣、每段套規則回 `{legMode, travelMin}`。
- `legDuration`：單段單模式取值。

整合（jsdom，mock 伺服器動作）：
- `ItineraryCard` 下拉改模式 → 呼叫 `onChangeLegMode`；loading/失敗路徑。
- `ItineraryClient`：手動改某段 → `legDuration` → 更新該段 + 重算；結構改變（拖曳）→ 2 秒後 `computeLegPlan` + merge → 段時間更新、手動段保留。

既有全測試需保持綠（`haversineSeconds` 抽取行為不變；`schedule.ts` 改 travel 來源後既有排程測試需更新或保持等價）。

---

## 10. 全域約束

- TypeScript strict，無 `any`。不新增 npm 套件（距離矩陣既有）。
- UI 文案繁體中文。
- 可選欄位 + 衍生讀取 → 零 fixture 遷移。
- 決定性（距離/取最快/平手序固定，無隨機/時間相依）。
- 結構改變的 leg 重算一律走既有 2 秒 debounce，拖曳零延遲感。
- 路線排序與地圖嵌入維持 plan 模式不變；per-段為其上的顯示/計時層。
