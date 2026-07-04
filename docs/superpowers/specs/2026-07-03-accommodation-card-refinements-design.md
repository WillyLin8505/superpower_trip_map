# 住宿卡優化（延到 dayEnd + 早 check-in 提醒）Design Spec

**日期：** 2026-07-03
**類型：** follow-up（微調，非原 9 子專案）；延伸 #3 住宿排程、#6 空閒區塊
**狀態：** 設計定稿，待寫 plan

---

## 1. 目標

兩項住宿卡的小優化：
- **(A)** 當一天最後一張是住宿卡時，其停留時長延到當天 `dayEnd`（抵達 → 你設的結束時間），取代原本住宿後的灰色「空閒」pill。
- **(B)** 住宿的 check-in（抵達）時間早於 **15:00** 時，卡片顯示衍生提醒。

兩項皆**純衍生 / 純排程行為，不新增任何儲存欄位**（零 fixture 遷移）。附帶解決 #6 最終審查記錄的「住宿當天最後一張後仍出現天尾空閒 pill」的觀感問題。

---

## 2. (A) 住宿延到 dayEnd

### 行為
一天的**最後一張**地點若為 `accommodation`，其 `durationMin` 設為「抵達到 `dayEnd` 為止」：
```
durationMin = toMin(dayEnd) − toMin(住宿 startTime)
```
於是卡片顯示「抵達 → dayEnd」（例：19:00 → 21:00）；`freeBlocks` 的天尾剩餘 = `dayEndMin − (start + durationMin)` = 0 → **灰色 pill 自動消失**（不需改 `freeTime.ts` 或 `ItineraryCard` 的 pill 邏輯）。

### 實作點：`recalcDay`（`lib/utils/clientScheduler.ts`）
`recalcDay` 是所有排程重算的單一收斂點——初次建立經 `applyLegDefaults → recalcDay`（#4）、任何客戶端編輯經 `scheduleRecalc → recalcPlan → recalcDay`——所以規則只放這一處即全涵蓋。

在 `recalcDay` 算完各站 `startTime`（兩條路徑：無鎖 forward、含鎖前後段）後、回傳前，對最終 `places` 套用一個尾端轉換 `extendLastAccommodation(places, dayEndMin)`：
- 取最後一張 `last = places[places.length - 1]`。
- 若 `last.type === 'accommodation'` **且** `!last.durationLocked` **且** `toMin(last.startTime) < dayEndMin` → 回傳 `last.durationMin = dayEndMin − toMin(last.startTime)` 的新陣列。
- 否則原樣返回。

兩條回傳路徑都套用此轉換（抽成小 helper，兩處共用）。住宿是最後一張、其 `durationMin` 不影響任何後續站的排程，故此尾端調整安全。

### 規則細節與邊界
- **鎖停留（`durationLocked`）**：尊重鎖，不延長（使用者手動固定時長的逃生門）。
- **抵達已 ≥ dayEnd**（例：抵達 22:00、dayEnd 21:00）：`toMin(start) < dayEndMin` 為假 → 維持原 `durationMin`（不設負值）。
- **非最後一張的住宿**（多晚行程中間天的飯店仍是各天最後一張；若某天住宿不在最後，不套用）：僅對「最後一張且為住宿」套用。
- **空天 / 單張非住宿**：無作用。
- **手動編輯住宿時長**：下次 `recalcDay` 會貼回 dayEnd（除非鎖停留）——即設計意圖（釘在 dayEnd）。

---

## 3. (B) 早 check-in 提醒

### 行為
住宿卡的抵達時間（`startTime`）早於固定門檻 **15:00** 時，卡片顯示衍生提醒：
```
⚠ 早於一般 check-in 時間（15:00）
```
條件：`place.type === 'accommodation'` 且 `toMin(place.startTime) < 15 * 60`（900）。門檻固定 15:00（不可調，YAGNI）。

### 實作點：`ItineraryCard.tsx`
與既有衍生提醒（「⚠ 結束時間超出營業時間」`lateExit`、「⚠ 停留少於建議」）同區、同樣式（`text-xs text-orange-600 font-medium mt-1`）。純衍生自 `place.type` + `place.startTime`，**無新 prop、無新欄位**。需要把 `startTime` 轉分鐘（卡片內加一個小 `toMin` 或內聯解析）。

> 與 (A) 一致性：(A) 讓住宿 `startTime` = 抵達（check-in）時間，(B) 正是檢查該時間是否早於 15:00，兩者自然吻合。

---

## 4. 資料模型

無變更。兩項皆衍生：(A) 由 `recalcDay` 依 `dayEnd` 計算 `durationMin`；(B) 由卡片依 `type` + `startTime` 衍生顯示。零 fixture 遷移。

---

## 5. 元件與職責邊界

| 檔案 | 改動 |
|---|---|
| `lib/utils/clientScheduler.ts`（改） | `recalcDay` 尾端 `extendLastAccommodation` helper（(A)） |
| `components/ItineraryCard.tsx`（改） | 早 check-in 衍生提醒（(B)） |

不動 `freeTime.ts`、`ItineraryDay`、資料層、伺服器動作。

---

## 6. 邊界與錯誤處理

- 住宿抵達 ≥ dayEnd → 不延長（維持原時長）。
- 住宿鎖停留 → 不延長（尊重鎖）。
- 一天沒有住宿 / 住宿非最後一張 → (A) 不作用。
- (B) 僅住宿類型觸發；非住宿卡不顯示此提醒。
- 決定性：純函式計算，同輸入同輸出。

---

## 7. 測試策略（TDD）

`recalcDay`（(A)，`__tests__/client-scheduler` 或新測試）：
- 最後一張住宿、抵達 19:00、dayEnd 21:00 → 住宿 `durationMin` = 120（結束 21:00）。
- 最後一張住宿但 `durationLocked` → 時長不變。
- 最後一張住宿、抵達 ≥ dayEnd → 時長不變。
- 最後一張非住宿 → 不受影響（既有行為）。
- 搭配 `freeBlocks`：延長後該天天尾 remaining = 0 → 無 pill（可於 freeTime 或 ItineraryDay 既有測試層級驗證，或於整合測試）。

`ItineraryCard`（(B)）：
- 住宿卡 `startTime` 13:00 → 顯示「早於一般 check-in 時間（15:00）」。
- 住宿卡 `startTime` 15:00 或更晚 → 不顯示。
- 非住宿卡（景點）`startTime` 13:00 → 不顯示。

既有全測試需保持綠（(A) 可能影響既有含「最後一張住宿」的排程/空閒測試——依新行為更新其預期）。

---

## 8. 全域約束

- TypeScript strict，無 `any`。不新增 npm 套件。
- UI 文案繁體中文。
- 純衍生 / 純排程行為 → 零 fixture 遷移。
- 決定性（無隨機/時間相依）。
- 只改 `recalcDay` + `ItineraryCard`；不動資料層/伺服器動作/推薦功能（降低與其他 lane 衝突）。
