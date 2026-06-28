# 時間軸視圖 — 整合點交接 Lane A（Handoff Brief）

**日期：** 2026-06-28
**狀態：** Lane B 平行實作新檔中；**這兩個熱檔的整合改動歸 Lane A**
**Spec：** `docs/superpowers/specs/2026-06-28-timeline-view-design.md`（見 §12 Lane 分工）

---

## 為什麼給 Lane A
`ItineraryClient.tsx` 與 `ItineraryCard.tsx` 是 Lane A 正在頻繁編輯的核心檔（剛做完 startLocked/durationLocked 拆分、整天鎖）。為避免平行衝突，這兩檔的改動由 Lane A 負責；Lane B 只做全新檔。

## Lane B 會交付（你消費的介面）
- `lib/utils/timeline.ts`：版面/resize/刻度純函式。
- `components/CardContent.tsx`：共用卡片內容元件。
- `components/TimelineCard.tsx`：時間軸卡片（含下緣 resize）。
- `components/TimelineDay.tsx`：時間軸的一天。**props 與既有 `ItineraryDay` 完全相同**，可直接二選一渲染。

## Lane A 要做的兩件事

### 1. `app/itinerary/ItineraryClient.tsx`（唯一同步點，additive 小改）
- 加 `const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')`。
- 頂部加切換鈕（📋 清單 / 🗓 時間軸）切 `viewMode`。
- 在每天的 `SortableContext` 內，依 `viewMode` 渲染 `ItineraryDay`（list）或 `TimelineDay`（timeline）——**props 不變**（兩者簽名相同）。
- `viewMode` 為 UI-only，不進 `plan`、不觸發 recalc。`DndContext`/`SortableContext`/scheduleRecalc 全部不動。

### 2. `components/ItineraryCard.tsx`（可延後的純重構）
- 改用 Lane B 的 `CardContent` 取代卡內重複的內容渲染（名稱/TypePicker/營業時間/評分/說明/鎖鈕/警告），去除與 `TimelineCard` 的重複。
- 純重構、對外行為與既有測試**零回歸**。若此時你正在大改該檔，可延後到方便時再併。

## 驗收
- 切換鈕能在清單 ⇄ 時間軸切換；時間軸用 `TimelineDay` 渲染。
- 清單視圖既有測試零回歸。
- resize/拖曳/鎖/類型/地圖在兩視圖皆正常（Lane B 元件已自帶測試；整合後做一次 UAT）。

## 交接邊界
- Lane B：上述 4 個新檔 + 各自測試。
- Lane A：上述 2 個熱檔的整合 + 整合後 UAT。
