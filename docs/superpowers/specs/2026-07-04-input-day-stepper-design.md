# 輸入頁天數上下箭頭（day-count stepper）Design Spec

**日期：** 2026-07-04
**Lane：** A（主 worktree / `main`）

## 1. 目標

規劃輸入頁（`app/page.tsx`，標題「旅遊行程規劃」）的「天數」目前是唯讀顯示，只能靠改「開始日期 / 結束日期」間接調整。本功能在天數旁加一組 ▲/▼ 上下箭頭，讓使用者直接加減旅程天數。

## 2. 範圍

- **只改輸入頁** `app/page.tsx`。行程編輯頁（`ItineraryClient` 的「共 N 天」）**不在本次範圍**——該頁已可用結束日期 picker 增減天並觸發散開/刪除流程。
- 純前端互動，無新資料欄位、無 server action、無新 npm 套件。

## 3. 狀態模型（Approach A — 衍生）

天數維持 **衍生值**，不新增獨立 state：

```
天數 N = daysBetween(startDate, endDate)   // 既有；含頭尾（start===end → 1 天）
```

▲/▼ 只調整 `endDate`，`startDate` 不動：

- **▲（增加一天）：** `setEndDate(addDays(endDate, 1))` → N 變 N+1。
- **▼（減少一天）：** `setEndDate(addDays(endDate, -1))`，但不得早於 `startDate`。

單一事實來源＝日期。既有結束日期 picker 與 stepper 永遠一致；`handleSubmit` 仍以 `daysBetween(startDate, endDate)` 計算 `days`，不變。

`addDays` / `daysBetween` 皆為 `lib/utils/date.ts` 既有純函式（本地午夜解析，DST 安全）。

## 4. 邊界

- **下限 = 1 天。** 當 `N === 1`（即 `endDate === startDate`）時，▼ 按鈕 **disabled**；即使被呼叫也不得讓 `endDate` 早於 `startDate`（防禦性夾住）。
- **上限：無硬上限。** 旅程長度不限。

## 5. UI / 版面

沿用既有那格 `<div className="flex flex-col gap-1">`（label「天數」+ 顯示）。把唯讀 `<span>{N} 天</span>` 換成「數字 + 垂直 ▲/▼ spinner」：

```
天數
┌──────────┐
│ 2 天   ▲ │
│        ▼ │
└──────────┘
```

- 數字「N 天」在左，▲ 在上、▼ 在下於右側。
- ▲/▼ 為 `type="button"`（避免觸發表單提交），小尺寸。
- ▼ 在 `N === 1` 時 disabled（灰階、不可點）。
- 無障礙：▲ `aria-label="增加一天"`、▼ `aria-label="減少一天"`。
- 文案繁體中文；沿用既有 Tailwind 樣式語彙（border / rounded / hover:bg-gray-50 之類），與頁面其他控制項一致。

## 6. 錯誤 / 邊界處理

- 不可能產生 < 1 天：▼ 於下限 disabled + 呼叫端夾住雙保險。
- 無網路 / 非同步操作；純本地 state 更新，瞬時。

## 7. 測試（jsdom + RTL，對 `InputPage`）

1. **▲ 增加天數：** 初始 2 天 → 點 ▲ → 顯示 3 天，且結束日期 = 開始日期 +2 天。
2. **▼ 減少天數：** 初始 2 天 → 點 ▼ → 顯示 1 天，結束日期 = 開始日期。
3. **下限：** 1 天時 ▼ 為 disabled（`toBeDisabled()`）；天數維持 1、結束日期維持 = 開始日期。
4. **無回歸：** 手動改結束日期 picker 仍正確反映到天數（沿用既有行為）。

> 決定性：如既有 InputPage 測試需要「今天」，沿用相同方式（固定/注入日期），不依賴真實系統時鐘作斷言基準。

## 8. Global Constraints

- TypeScript strict，無 production `any`。
- 只改 `app/page.tsx`（＋新增其測試檔）。無新欄位、無新套件。
- UI 文案繁體中文。
- 既有全測試保持綠；`next build` 成功（gate 需含 `next build`，非只 `npm test`）。

## 9. Self-Review

- **Placeholder scan：** 無 TBD。
- **一致性：** 狀態模型（§3）＝衍生、只動 endDate，與 UI（§5）、測試（§7）一致。
- **範圍：** 單一小控制項，單一 plan 即可，無需拆解。
- **歧義：** 「上下箭頭」明確為垂直 ▲/▼ spinner（§5）；天數＝含頭尾 inclusive（§3）。
