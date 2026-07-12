# 封存停車場 + 3 頁籤側欄 + 地圖重排 Design Spec

**日期：** 2026-07-12
**產品發現：** `$multi-auto-spec`(office-hours → 4 個產品決策 + 1 個資料模型決策）
**前置：** C5 LINE group candidate ingest（`trip_candidates` 池,PR #10）— 本案沿用其資料表與「加入行程」流程。

## 1. 目標

讓使用者把任一地點卡片「封存」到一個 per-trip 的停車場,之後可再加回行程;並把行程頁改成「地圖在 AI 摘要下方 + 右側 3 頁籤面板(推薦 / LINE 討論 / 封存),與行程欄同高」。

## 2. 背景（現況,先讀）

- 行程頁 `components/ItineraryDay.tsx` 版面:AI 摘要(整寬)→ 一個 `flex` 兩欄:左 = 行程卡片(`flex-1`),右 = 側欄 `w-96 sticky`,側欄內**地圖在上、`DayRecommendations` 在下**。
- 推薦:`DayRecommendations` / `RecommendationCard`(每天算出的 shown/reserve,可 `onAddRecommendation` 加入行程)。
- LINE 討論:C5 的 `trip_candidates` 表(per-trip 地點池),`components/CandidatePanel.tsx` 顯示,可加入行程。
- **完全沒有 archive/封存概念**(全新)。
- 型別:`ScheduledPlace`(行程內)、`Place`(地點)、`TripCandidate`(候選池 row),`trip_candidates` 欄位:`id, trip_id, place_id, place, added_by, source, created_at`。

## 3. 產品決策（office-hours 定案）

- **DEC-501 封存粒度：** 封存的是**單一地點卡片**(一個景點/餐廳),不是整天或整個 trip。
- **DEC-502 可還原（停車場模式）：** 封存 = 暫時收起來的「待定池」;封存頁籤裡可用既有「加入行程」流程把它加回某天。不是永久刪除。
- **DEC-503 封存範圍：** **每個 trip 一個封存池**(跨天共用),與 `trip_candidates`(LINE 候選)同層級。
- **DEC-504 跨介面：** 封存 icon 出現在**行程卡片、推薦卡片、LINE 候選卡片**上,三處都能封存。
- **DEC-505 資料模型：** 重用 `trip_candidates` 表,加一個 `list` 欄位區分 `'candidate'`(LINE 候選,預設)/ `'archived'`(封存)。不新增表。
- **DEC-506 版面：** 地圖移到 AI 摘要下方;右側改 3 頁籤面板(推薦 / LINE 討論 / 封存),與行程欄同高。

## 4. 範圍

- **資料：** 遷移 `0006_archive_list.sql` — `alter table trip_candidates add column if not exists list text not null default 'candidate' check (list in ('candidate','archived'))`。
- **型別：** `TripCandidate` 加 `list: 'candidate' | 'archived'`;新 `ArchivedPlace = TripCandidate`(語意別名,可省)。
- **Server actions（`app/actions/candidates.ts` 或新 `archive.ts`）：**
  - `archivePlace(tripId, place)` → insert `trip_candidates`(`list='archived'`);去重沿用 C5 的 `place_id` unique。
  - `listArchived(tripId)` → `trip_candidates` where `list='archived'`。
  - `unarchivePlace(candidateId)` → 刪除該封存 row(加回行程用既有 `onAddCandidate`/`addPlaceToDay` 流程)。
  - `listCandidates` 既有查詢加 `list='candidate'` 條件(不回封存的)。
- **UI：**
  - 每張卡片左側加封存按鈕 → `onArchive(place)`:`ItineraryCard`(封存＝從當天移除 + 寫封存池)、`RecommendationCard`、`CandidatePanel` 的卡片。
  - 新 3 頁籤面板元件 `components/SidePanel.tsx`(暫名):頁籤 推薦 / LINE 討論 / 封存;內容分別是 `DayRecommendations`、`CandidatePanel`(list='candidate')、新的封存清單。
  - `ItineraryDay.tsx` 版面重排:地圖從側欄移到 AI 摘要下方(內容區整寬);右側欄換成 `SidePanel`,與行程欄 `items-stretch` 同高。
- **不改：** 行程排程/鎖/推薦計算邏輯;`trip_candidates` 既有 RLS(封存走同 participant 政策)。

## 5. 資料模型

```sql
-- 0006_archive_list.sql（附加於 0005 之後）
alter table public.trip_candidates
  add column if not exists list text not null default 'candidate'
  check (list in ('candidate', 'archived'));
create index if not exists trip_candidates_trip_list_idx
  on public.trip_candidates(trip_id, list);
```

- `list='candidate'`：LINE / 手動候選(既有行為,查詢加此條件）。
- `list='archived'`：封存池。
- 型別：`TripCandidate` 追加 `list: 'candidate' | 'archived'`;`lib/candidates.ts` 讀寫帶上 `list`。

## 6. 互動 / UI

### 卡片封存按鈕（三處）
- 位置:卡片**左側**(與現有右側刪除/鎖按鈕分開),icon 用「📥 / 儲存」語意,`aria-label="封存"`。
- 行程卡片按下 → 該地點從當天 `places` 移除(client plan 更新)+ `archivePlace(tripId, place)`;卡片消失。
- 推薦 / LINE 候選卡片按下 → `archivePlace`;該卡片從其清單移除(推薦:本次 session 隱藏;LINE:list 改 archived)。

### 3 頁籤面板（右側,與行程欄同高）
- 頁籤列:`推薦行程`｜`LINE 討論`｜`封存`。預設「推薦行程」。
- **推薦行程**:現有 `DayRecommendations`(不變)。
- **LINE 討論**:現有 `CandidatePanel`,查詢限 `list='candidate'`。
- **封存**:封存卡片清單;每張可「加入行程」(既有流程)與「永久刪除」。空狀態顯示「尚未封存任何地點」。
- 面板高度:與左側行程欄 `items-stretch`;內容可捲動(`overflow-y-auto`)。

### 版面
- AI 摘要(整寬)→ **地圖(整寬,在摘要下)** → 兩欄:左行程 / 右 3 頁籤面板。
- 地圖沿用 `buildDayEmbedUrl`;只是從側欄移到摘要下方的整寬容器。

## 7. 錯誤 / 邊界

- 封存去重:同 trip 同 `place_id` 已在封存池 → no-op(沿用 C5 unique index 的 duplicate 處理)。
- 未登入 / RLS:封存讀寫走 `trip_candidates` 既有 participant RLS;非 participant 無法讀寫。
- 加回行程的地點:從封存池刪除後,用既有 add 流程放進當天(封存不保留原本的時間/鎖,視為新加入)。
- 空狀態:三個頁籤各自有空狀態文案。

## 8. 測試（TDD）

1. **`archivePlace`**:寫入 `trip_candidates` 且 `list='archived'`;重複同 place_id → duplicate 不重寫。
2. **`listArchived` / `listCandidates`**:各自只回對應 `list` 的 row(封存不混進 LINE 候選,反之亦然)。
3. **`unarchivePlace`**:刪除該封存 row。
4. **卡片封存按鈕**:三處(itinerary/recommend/candidate)按下觸發 `onArchive`(元件層 mock);行程卡片封存後從當天列表消失。
5. **3 頁籤面板**:切換頁籤顯示對應內容;封存頁籤顯示封存清單 + 空狀態。
6. **版面**:地圖渲染在 AI 摘要下方(非側欄);面板與行程欄同容器。
7. **回歸**:既有推薦「加入行程」、LINE 候選、行程排程/鎖不受影響。

## 9. Global Constraints

- TypeScript strict,無 production `any`。
- 遵循 `DESIGN.md`(溫暖旅誌:warm paper / clay);頁籤與封存 icon 沿用既有 token。
- server action 一律 participant 授權後寫入。
- 既有全測試保持綠;`next build` 成功。

## 10. Self-Review

- **Placeholder scan：** 無 TBD。
- **決策保留：** DEC-501…DEC-506 皆在 §3 定案並貫穿 §5–§8。
- **一致性：** §5 資料表 ↔ §6 UI ↔ §8 測試對齊;重用 `trip_candidates`,不動其 RLS,遷移為附加式(0006)。
- **範圍：** 一個 `list` 欄位 + 3 個 archive action + 卡片按鈕 + 3 頁籤面板 + 版面重排。中等規模,單一 spec;實作可拆成「資料/action」「卡片封存」「版面/頁籤」三個 plan 步驟,但屬同一 spec。
- **依賴：** 需 C5(`trip_candidates`,已在 main)。與 TASK-011(照片,改 card 內部)/ TASK-012(地圖抽屜)在 card 與版面上有衝突面 → 需標入 `## Conflicts`。
