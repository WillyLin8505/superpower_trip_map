# 封存 + 3 頁籤側欄 + 地圖重排 — Implementation Plan

**Spec：** `docs/superpowers/specs/2026-07-12-archive-and-tabbed-panel-design.md`
**日期：** 2026-07-12

## 前置

- 需 C5（`trip_candidates`,已在 main）。認領前以 `$multi-claim-task` 確認 `## Locked Files` 無重疊 —— 特別注意與 TASK-011(照片,改 `ItineraryCard.tsx`/`RecommendationCard.tsx`)、TASK-012(地圖抽屜)在 card 與版面的衝突。建議在 011/012 之後或同一 session 做。
- 需 Supabase migration 套用權限。

## 實作步驟（TDD：先寫測試再實作）

### 步驟 1 — 資料層:list 欄位 + archive actions
- 遷移 `supabase/migrations/0006_archive_list.sql`（spec §5）。
- 型別:`lib/types.ts` `TripCandidate` 加 `list: 'candidate' | 'archived'`。
- 測試 `__tests__/archive-actions.test.ts`（mock Supabase admin）:
  - `archivePlace` 寫入 `list='archived'`;重複 place_id → duplicate。
  - `listArchived` 只回 archived;`listCandidates` 只回 candidate。
  - `unarchivePlace` 刪除 row。
- 實作 `app/actions/candidates.ts`（或新 `app/actions/archive.ts`）:`archivePlace` / `listArchived` / `unarchivePlace`;`lib/candidates.ts` 讀寫帶 `list`,`listCandidates` 查詢加 `list='candidate'`。

### 步驟 2 — 卡片封存按鈕（三處）
- 測試 `__tests__/card-archive-button.test.tsx`:`ItineraryCard`/`RecommendationCard`/`CandidatePanel` 卡片顯示封存按鈕;點擊觸發 `onArchive(place)`（mock）。
- 實作:三個元件加左側封存按鈕 + `onArchive` prop。行程卡片封存 → 呼叫上層 handler 從當天移除 + `archivePlace`。

### 步驟 3 — 3 頁籤面板元件
- 測試 `__tests__/side-panel.test.tsx`:切頁籤顯示 推薦/LINE/封存;封存頁籤顯示清單 + 空狀態 + 「加入行程」「永久刪除」。
- 實作 `components/SidePanel.tsx`:頁籤狀態 + 三個內容(`DayRecommendations`、`CandidatePanel`(list='candidate')、封存清單)。封存清單卡片「加入行程」走既有 `onAddCandidate`,「永久刪除」走 `unarchivePlace`。

### 步驟 4 — ItineraryDay 版面重排
- 測試 `__tests__/itinerary-day-layout.test.tsx`:地圖渲染在 AI 摘要下方(非側欄);`SidePanel` 與行程欄在同一列容器。
- 實作 `components/ItineraryDay.tsx`:把地圖 `iframe` 從側欄搬到 AI 摘要下方的整寬容器;右側欄由 `DayRecommendations` 換成 `SidePanel`;兩欄 `items-stretch` 同高。
- `ItineraryClient.tsx`:接上 archive/unarchive handlers(封存後更新 plan + 重新查候選/封存)。

### 步驟 5 — 文件
- README 或 spec 附註 archive 行為(可選)。

## 驗證

- `npx jest __tests__/archive-actions.test.ts __tests__/card-archive-button.test.tsx __tests__/side-panel.test.tsx __tests__/itinerary-day-layout.test.tsx` → 全綠。
- `npm test` 全套保持綠(注意 main 目前有 3 個既有失敗 `trips-actions`/`itinerary-client-save`,與本案無關)。
- `npx tsc --noEmit`（忽略既有 test 型別債）。
- `next build` 成功。
- 手動:封存行程卡 → 消失 + 出現在封存頁籤;封存頁籤加回 → 回到當天;推薦/LINE 卡也能封存;地圖在摘要下方、面板與行程同高。

## 風險 / 備註

- 與 TASK-011 / TASK-012 共改 card 與版面 → 排程上避免並行(見 `## Conflicts`)。
- 推薦卡片封存:推薦是每次算出的 ephemeral 清單;封存推薦後,本 session 從顯示隱藏即可(不需改推薦計算)。
- `RecommendationCard` 目前也被 timeline 版(`TimelineCard`/`CardContent`)共用 → 封存按鈕加在共用點時注意兩種版面。
