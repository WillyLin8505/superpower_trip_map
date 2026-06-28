# 拆分時間鎖（開始/停留）+ 整天全鎖 Design

**Goal:** 把現在合一的時間鎖（`timeLocked`，同時鎖開始時間與停留時間）拆成兩個獨立的鎖——**開始時間鎖**與**停留時間鎖**；每張卡片各有兩個鎖按鈕，每天標頭各有兩個「整天全鎖」按鈕。兩個都鎖 = 那天完全凍結（不能拖、不能改時間）。

**Scope:** 路線圖 **#5 的「拆分鎖」部分提前做**。#5 的其餘部分（每地點 Google 估算停留時間）不在本次。

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS。不新增 npm 套件。

---

## 1. 資料模型

`lib/types.ts` 的 `ScheduledPlace`：移除 `timeLocked`，新增兩個獨立旗標。

```typescript
export interface ScheduledPlace extends Place {
  startTime: string
  durationMin: number
  travelMinToNext: number | null
  aiDescription: string | null
  outsideHours: boolean
  lateExit: boolean
  startLocked: boolean       // 鎖開始時間（取代 timeLocked 的排程錨點角色）
  durationLocked: boolean    // 鎖停留時間
}
```

初始排程（`app/actions/schedule.ts`）兩者皆設 `false`（取代 `timeLocked: false`）。

---

## 2. 兩種鎖的語意

| 鎖 | 凍結什麼 | 拖曳 | 卡片時間顯示 |
|----|----------|------|--------------|
| **開始時間鎖** `startLocked` | 釘住開始時間：重排時不被移動，並作為排程錨點（取代現行 `timeLocked` 的 anchor 角色） | **不能拖**（drag handle 隱藏、`useSortable` disabled） | 開始時間顯示為靜態文字 |
| **停留時間鎖** `durationLocked` | 釘住停留時長：不被改動 | 仍可拖 | 結束/停留時間顯示為靜態文字 |

- 兩者可獨立組合（例如「鎖開始、不鎖停留」＝位置與開始時間釘死，但可調整停留時長）。
- 註：目前 `recalcDay` 本來就不會自動改 `durationMin`，故 `durationLocked` 現階段的可觀察效果＝「停留/結束時間不能被編輯」，並作為未來自動估時(#7)的基礎。

---

## 3. 排程接線（`lib/utils/clientScheduler.ts`）

- 現行 `recalcDay` 以 `timeLocked` 判斷錨點（locked 項目保留 `startTime`/`durationMin`，前段 `scheduleBackwards`、後段 `scheduleForward`）。
- 改為以 **`startLocked`** 作為錨點判斷：`startLocked` 的項目保留其 `startTime` 並作為前後分段的錨。
- `durationLocked` **不影響**錨定邏輯；`durationMin` 在重排中本就維持原值，無需特別處理。
- `app/actions/schedule.ts` 初始排程的 `timeLocked: false` 改為 `startLocked: false, durationLocked: false`。

---

## 4. 卡片 UI（`components/ItineraryCard.tsx`）

取代現在單一的 🔒/🔓 按鈕，改為**兩個獨立小按鈕**（互不影響）：

- `🔒/🔓 開始` → 切換 `startLocked`（`aria-label`：「鎖定開始時間」/「解鎖開始時間」）
- `🔒/🔓 停留` → 切換 `durationLocked`（`aria-label`：「鎖定停留時間」/「解鎖停留時間」）

時間顯示改為**各自獨立**依其鎖狀態：
- 開始時間：`startLocked` → 靜態文字；否則 `TimeScrollPicker`。
- 結束時間（換算停留）：`durationLocked` → 靜態文字；否則 `TimeScrollPicker`。
- （目前「locked 時整段顯示靜態 `start → end`」的邏輯改為上述兩段各自判斷。）

拖曳：
- `useSortable({ id, disabled: !draggable || place.startLocked })`。
- `startLocked` 時隱藏 drag handle。

按鈕為 `<button type="button">`，避免觸發拖曳/表單送出。

---

## 5. 每天標頭：兩個「整天全鎖」按鈕（`components/ItineraryDay.tsx`）

在「第 N 天」標頭旁加兩個切換按鈕：

- **整天鎖開始** → 把那天每一項的 `startLocked` 設為 `true`；再按一次全部設 `false`。
- **整天鎖停留** → 把那天每一項的 `durationLocked` 設為 `true`；再按一次全部設 `false`。

衍生狀態（每個按鈕各自計算）：
- 若那天**所有**項目該類型皆已鎖 → 顯示為「已鎖」外觀，點擊＝全解。
- 否則 → 顯示「未鎖」外觀，點擊＝全鎖。
- 空的那天（`places.length === 0`）：按鈕 `disabled`。

文案（暫定，可微調）：`🔒 整天鎖開始` / `🔓 整天鎖開始`、`🔒 整天鎖停留` / `🔓 整天鎖停留`。

---

## 6. 事件接線（`app/itinerary/ItineraryClient.tsx`）

鏡像現有 `handleToggleLock` 的「即時 setPlan + planRef、**不重排**」模式，**改鎖不觸發重排、不改 `startTime`/`durationMin`**：

- `handleToggleStartLock(dayIdx, placeId)` — 切單項 `startLocked`。
- `handleToggleDurationLock(dayIdx, placeId)` — 切單項 `durationLocked`。
- `handleSetDayStartLock(dayIdx, locked: boolean)` — 設整天 `startLocked`。
- `handleSetDayDurationLock(dayIdx, locked: boolean)` — 設整天 `durationLocked`。

（`ItineraryDay` 接收對應 callbacks 並下傳卡片；day 層計算衍生狀態後呼叫 `handleSetDay*Lock(dayIdx, !allLocked)`。）

移除原 `handleToggleLock`。

---

## 7. 遷移

`timeLocked` 為資料模型變更，連帶更新：`lib/types.ts`、`app/actions/schedule.ts`、`lib/utils/clientScheduler.ts`、`components/ItineraryCard.tsx`、`components/ItineraryDay.tsx`、`app/itinerary/ItineraryClient.tsx`，以及所有引用 `timeLocked` 的測試（改為 `startLocked`/`durationLocked`）。`lib/utils/dragContainers.ts` 若引用 `timeLocked` 一併調整。

---

## 8. 不在範圍

- 每地點 Google 估算停留時間（#5 另一部分 / 需求 7）。
- 鎖定的那天仍可「新增地點」（只凍結既有項目）。
- 跨天把卡片**拖入**某天仍可（等同新增到該天）；該天已 `startLocked` 的既有項目維持其開始時間（作為錨點），新項目排入空檔。被拖的來源卡片本身若 `startLocked` 則不能拖（見 §4）。

---

## 9. Global Constraints

- TypeScript strict，無 `any`。
- 不新增 npm 套件。
- UI 文案皆為繁體中文。
- 改鎖（任一種、單項或整天）一律**不觸發重排、不改 `startTime`/`durationMin`**。
- 既有測試需全數通過（含已改名的鎖測試）；新功能以 TDD 補測試。

---

## 10. 變更檔案

| 檔案 | 動作 |
|------|------|
| `lib/types.ts` | `timeLocked` → `startLocked` + `durationLocked` |
| `app/actions/schedule.ts` | 初始兩鎖皆 false |
| `lib/utils/clientScheduler.ts` | anchor 判斷由 `timeLocked` 改 `startLocked` |
| `components/ItineraryCard.tsx` | 兩個鎖按鈕、時間各自靜態/picker、拖曳綁 `startLocked` |
| `components/ItineraryDay.tsx` | 標頭兩個「整天全鎖」按鈕、衍生狀態、下傳 callbacks |
| `app/itinerary/ItineraryClient.tsx` | 四個鎖 handlers，移除 `handleToggleLock` |
| `lib/utils/dragContainers.ts` | 若引用 `timeLocked` 則調整 |
| 相關測試 | `timeLocked` → 新欄位；新增兩鎖 + 整天全鎖測試 |

---

## 11. 測試

1. scheduler：`startLocked` 項目維持 `startTime` 並作為錨點；`durationLocked` 不影響錨定。
2. 卡片：`🔒 開始` 按鈕切換 `startLocked`；`🔒 停留` 按鈕切換 `durationLocked`（互不影響）。
3. 卡片：`startLocked` → 無 drag handle、開始時間靜態；`durationLocked` → 停留/結束時間靜態。
4. 整天全鎖：點「整天鎖開始」→ 那天每項 `startLocked=true`；再點 → 全 `false`；停留同理。
5. 整天全鎖衍生狀態：部分已鎖時按鈕顯示「未鎖（點擊全鎖）」；全鎖時顯示「已鎖（點擊全解）」。
6. 改鎖不改 `durationMin`/`startTime`、不重排（client 層）。
