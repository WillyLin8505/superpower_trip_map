# 編輯時間即軟錨點 + 鄰居讓位 — Implementation Plan

**Spec：** `docs/superpowers/specs/2026-07-14-edit-time-cascade-design.md`
**日期：** 2026-07-14

## 前置

- TASK-022 已完成,`app/itinerary/ItineraryClient.tsx` 已解鎖。認領前以 `$multi-claim-task` 確認 `## Locked Files` 無重疊(尤其 `ItineraryClient.tsx`)。
- 讀 `client-scheduler.test.ts` / `end-lock-schedule.test.ts` / `itinerary-lock-invariant.test.tsx` 理解既有錨點語意,確保只新增測試、不破壞既有。

## 實作步驟（TDD：先寫測試再實作）

### 步驟 1 — 純函式 cascade（核心）
- 測試 `__tests__/time-edit-cascade.test.ts`（spec §8 的 1–5）:給整段 places + 被編輯 placeId/field/value,斷言輸出的每張卡片 start/duration:
  - 往後移 / 往前移(對稱)、保留交通(`prev.end+travel=next.start`)、反轉夾住(`end=start`、停留 0)、第一張/最後一張邊界。
- 實作 `lib/utils/timeEdit.ts`:新函式 `applyTimeEditCascade(places, placeId, field, value)`:
  1. 被編輯卡片:套用新值,整塊平移(保開始/停留,動結束 — DEC-602)。
  2. 前一張:保開始、調停留使 `end = editedStart - travel`(DEC-603);若 `end < start` 夾住為 `end=start`、停留 0(DEC-604)。
  3. 後續卡片:自被編輯卡片結束往後 forward-fill(保各自停留)。
  4. 往前移對稱處理(DEC-605)。

### 步驟 2 — scheduler 錨點整合
- 測試:延伸 `time-edit-cascade` 或新增,驗證經過 `recalcDay` 後被編輯值不被重算蓋掉(把被編輯卡片視為該次軟錨)。
- 實作 `lib/utils/clientScheduler.ts`:讓 cascade 結果進入 `recalcDay` 時,被編輯卡片視為錨點(不重算其 start);緊鄰前一張的 leading 規則改為「保開始、縮放停留對齊(DEC-603/604)」而非平移開始。顯式鎖優先(DEC-606)。

### 步驟 3 — 呼叫點接線
- 測試 `__tests__/itinerary-client-time-edit.test.tsx`:元件層,拖動中間卡片開始時間 → 前一張結束對齊、後續往後、被編輯值保留。
- 實作 `app/itinerary/ItineraryClient.tsx`:`handleTimeChange` 改呼叫 `applyTimeEditCascade`(取代目前的單卡 `applyTimeEdit` + 直接 recalc)。

### 步驟 4 — 顯式鎖交互 + 回歸
- 測試 spec §8 的 6–7:鎖住鄰居時 cascade 夾在鎖邊界;既有 `client-scheduler.test.ts` 全綠。

## 驗證

- `npx jest __tests__/time-edit-cascade.test.ts __tests__/itinerary-client-time-edit.test.tsx __tests__/client-scheduler.test.ts` → 全綠。
- `npm test` 全套保持綠。
- `npx tsc --noEmit`。
- `next build` 成功。
- 手動:拖中間卡片開始往後/往前 → 前一張結束對齊(含交通)、後續跟隨、被編輯值不彈回、無法對齊時停留變 0。
- **依 CLAUDE.md:** 跑 `codex` review + challenge(排程邊界)。

## 風險 / 備註

- 觸及核心排程,~10 個排程測試檔語意相鄰 → 嚴格「只新增測試、不改既有語意」;若既有測試需調整,先與 Manager 確認。
- 軟錨點只作用於本次重算,不寫 `*Locked` 欄位(不動鎖 UI)。
- 「前一張對齊」與既有 `scheduleBackwards`(平移開始)語意不同 —— 這是本案刻意的行為變更,實作時保留一條路徑給純鎖驅動情境(既有測試),另一條給編輯軟錨情境。
