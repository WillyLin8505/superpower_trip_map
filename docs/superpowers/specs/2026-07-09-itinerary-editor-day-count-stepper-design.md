# 行程編輯頁天數上下箭頭（itinerary editor day-count stepper）Design Spec

**日期：** 2026-07-09
**Lane：** Manager / TASK-014
**前置：** `docs/superpowers/specs/2026-07-04-input-day-stepper-design.md`（輸入頁 stepper，範圍互斥，本篇不重複實作）

## 1. 目標

行程編輯頁（`app/itinerary/ItineraryClient.tsx`）目前只能透過「開始日期／結束日期」兩個原生 `<input type="date">` 調整天數，沒有像輸入頁那樣的 ▲/▼ 快速加減。本功能在「共 N 天」文字旁加一組 ▲/▼，作為既有日期輸入的**便利捷徑**，不取代日期輸入、不新增任何刪除/資料處理邏輯。

## 2. 背景：現有機制（重要，先讀）

行程編輯頁**已經**有完整的天數變更與縮短處理機制，本功能全部重用、不重寫：

- `handleChangeEndDate`（`ItineraryClient.tsx:503-519`）：
  - **增加天數**（`targetN > 現有天數`）：自動 append 空白 `DayItinerary`（`places: []`、`dayStart: '09:00'`、`dayEnd: '21:00'`），並清除 `targetDays`。
  - **減少天數**（`targetN <= 現有天數`）：**不刪除任何資料**，只記錄 `setTargetDays(targetN)`。
- `overCount` 警告 banner（`ItineraryClient.tsx:648-651`）：當 `plan.days.length > targetDays` 時顯示「行程天數（M）大於設定天數（N），請處理超出的天。」
- 每一天卡片已有 `onDelete`（呼叫 `handleDeleteDay`，直接刪除該天）與 `onScatter`（呼叫 `handleScatterDay`，將該天地點依地理位置分散併入其他天，不銷毀資料）兩個既有解決路徑（`ItineraryClient.tsx:708-709`）。

**結論：** 縮短流程的「資料保護」與「解決超出天數」已經做完，且早於本次 spec 存在。本功能**只新增 UI 捷徑**，不動上述任何函式的內部邏輯。

## 3. 範圍

- 只改 `app/itinerary/ItineraryClient.tsx`，在「共 {plan.days.length} 天」文字（現行 `ItineraryClient.tsx:650`）旁加 ▲/▼ 兩個按鈕。
- 不新增 state、不新增 server action、不改 `handleDeleteDay`／`handleScatterDay`／`overCount` banner 的行為或文案。
- 不做「一鍵刪除最後一天」或任何新的刪除/搬移邏輯——縮短後若造成 `overCount > 0`，維持現況：使用者用既有 banner + 該天卡片上的刪除/打散按鈕自行處理。
- 純前端互動，無新 npm 套件。

## 4. 狀態模型（100% 重用既有函式）

不新增任何狀態。▲/▼ 只是呼叫既有 `handleChangeEndDate`，帶入以既有「結束日期」`<input>` 相同方式算出的目前有效結束日：

```ts
const currentEnd = dayDate(plan.startDate, plan.days.length)   // 與現有結束日期 input 的 value 算法相同

// ▲
handleChangeEndDate(addDays(currentEnd, 1))

// ▼
handleChangeEndDate(addDays(currentEnd, -1))
```

- `addDays`／`dayDate` 皆為 `lib/utils/date.ts` 既有純函式。
- ▲ 觸發 `handleChangeEndDate` 的「增加天數」分支（自動 append 空白天）。
- ▼ 觸發「減少天數」分支（`setTargetDays`，顯示既有 `overCount` banner，若適用）。

## 5. 邊界

- **下限 = 1 天。** 當 `plan.days.length === 1` 時，▼ **disabled**（灰階、不可點），與輸入頁 stepper 及既有結束日期 input 的 `min={plan.startDate}` 保護一致的下限語意。
- **上限：無硬上限**，與既有結束日期 input 行為一致。
- ▼ 在已有 `targetDays`（即 banner 已顯示中）時再次點擊，沿用 `handleChangeEndDate` 既有邏輯即可（會重新計算 `targetN`），不需特殊處理。

## 6. UI / 版面

在 `ItineraryClient.tsx:636-651` 現有的日期輸入 `<section>` 內，「共 {plan.days.length} 天」文字右側加：

```
開始日期        結束日期        共 3 天  ▲
[date input]   [date input]           ▼
```

- ▲/▼ 為 `type="button"`，小尺寸，垂直排列（同輸入頁 stepper 的視覺語彙：數字在左、▲ 上 ▼ 下在右）。
- ▼ 在 `plan.days.length === 1` 時 disabled。
- 無障礙：▲ `aria-label="增加一天"`、▼ `aria-label="減少一天"`（與輸入頁 stepper 文案一致）。
- 沿用現有 Tailwind 樣式語彙（`border border-border rounded-lg` 等），與同一 section 內的日期 input 視覺一致。
- 既有 `overCount` banner 與日期 input 均**不動**，維持現有位置與文案。

## 7. 錯誤 / 邊界處理

- 無新錯誤路徑：▲/▼ 純本地 state 更新（透過既有 `handleChangeEndDate`），無非同步、無網路請求。
- ▼ 於下限（1 天）disabled，防止產生 0 天或負天數；`handleChangeEndDate` 內部既有 `Math.max(1, daysBetween(...))` 為雙保險。

## 8. 測試（jsdom + RTL，擴充既有日期控制測試檔）

1. **▲ 增加天數：** 初始 3 天 → 點 ▲ → `plan.days.length` 變 4，新增的第 4 天為空白（`places: []`、`dayStart: '09:00'`、`dayEnd: '21:00'`），`overCount` banner 不出現。
2. **▼ 減少天數（無內容的最後一天）：** 初始 3 天、第 3 天無內容 → 點 ▼ → 目標天數變 2；沿用既有 `handleChangeEndDate` 邏輯，`overCount` banner 依現有規則顯示/不顯示（不新增本功能專屬斷言，只驗證呼叫路徑正確）。
3. **▼ 減少天數（有內容的最後一天）：** 初始 3 天、第 3 天有 place → 點 ▼ → 出現既有 `overCount` banner（沿用既有測試斷言，不重寫 banner 邏輯測試）；驗證既有 `onDelete`/`onScatter` 仍可正常解決該 banner（回歸測試，不新增行為）。
4. **下限：** `plan.days.length === 1` 時 ▼ 為 `toBeDisabled()`；天數維持 1。
5. **無回歸：** 既有結束日期 `<input>` 手動輸入仍正確反映到「共 N 天」與 stepper 顯示（沿用既有行為）。

## 9. Global Constraints

- TypeScript strict，無 production `any`。
- 只改 `app/itinerary/ItineraryClient.tsx`（＋其測試檔 `__tests__/itinerary-date-controls.test.tsx`，已確認存在）。
- 不改 `handleDeleteDay`、`handleScatterDay`、`overCount` banner 文案/邏輯。
- UI 文案繁體中文，與既有 aria-label 命名慣例一致。
- 既有全測試保持綠；`next build` 成功。

## 10. Self-Review

- **Placeholder scan：** 無 TBD。
- **一致性：** §4 狀態模型（100% 重用 `handleChangeEndDate`）與 §6 UI、§8 測試一致；§2 明確記錄了本次 spec 刻意不動的既有機制，避免與 TASK-009/TASK-010（recommendation center）或 TASK-006/TASK-007（card duration/lock）產生誤解的重疊。
- **範圍：** 單一小控制項，重用既有函式，單一 plan 即可，無需拆解。
- **依賴：** 需等 TASK-006／TASK-007（正在進行中，鎖定 `ItineraryClient.tsx`）完成後才能安全實作，避免檔案衝突（見 `planning/PARALLEL_WORK_PLAN.md`「Do Not Run Together」）。
