# 時間軸視圖（Timeline View）Design

**日期：** 2026-06-28
**狀態：** 設計已核准 → 待 writing-plans
**歸屬：** Lane A（動到核心 `ItineraryCard` / `ItineraryClient`）

---

## 1. 目標

行程左側目前每張卡片等高、以清單呈現。新增一個**可切換**的「時間軸視圖」（像 Google Calendar）：左側有時間刻度，卡片高度 ∝ 停留時間，**拖曳卡片下緣**即可改變停留時長（越長＝待越久）。**清單視圖既有的所有功能在時間軸視圖一樣可用且可拖曳。**

## 2. 核心語意（已確認）

- **順序 reflow**：時間順排、不重疊、無空檔（旅行時間除外）。沿用既有 `recalcPlan`——時間軸只是把「停留時間」畫成高度 + 下緣 resize 改時長 + 自動 reflow。**不改排程模型、不改 `plan` 結構。**
- **旅行時間**：卡片之間留**等比例空檔**，中央一條連接線標「→ N 分鐘」。卡片高度純粹＝停留時間。
- **時間刻度**：**動態**貼合當天實際起訖（最早 `startMin` → 最晚結束），整點刻度。
- **切換**：全域 `viewMode: 'list' | 'timeline'`，預設 `list`。

## 3. 元件結構（Approach A：平行元件 + 共用內容）

```
components/
  CardContent.tsx     // 新：共用卡片內容（名稱/TypePicker/營業時間/評分/說明/鎖鈕/警告）
  ItineraryCard.tsx   // 改：清單卡片 = CardContent + 拖曳手把 + 起訖 picker + 車程行（行為不變）
  TimelineCard.tsx    // 新：時間軸卡片 = 高度∝時長 + CardContent + 下緣 resize 手把 + 可拖曳 reorder
  TimelineDay.tsx     // 新：左時間刻度 + 右等比例卡片排列（空檔+連接線）+ 保留 sticky 地圖
lib/utils/
  timeline.ts         // 新：純函式（版面計算、resize 數學、刻度產生）
app/itinerary/
  ItineraryClient.tsx // 改：viewMode state + 切換鈕；依 viewMode 渲染 ItineraryDay 或 TimelineDay
```

職責邊界：
- `CardContent`：只負責「一張卡片要顯示/操作的內容」，不管版面與定位。清單與時間軸共用，避免重複。
- `TimelineCard`：只負責「把一張卡片畫成有高度、可下緣 resize、可拖曳」。
- `TimelineDay`：只負責「刻度 + 把當天卡片依時間定位排好 + 地圖」。
- `lib/utils/timeline.ts`：純計算，無 DOM、可單元測試。

## 4. 純函式介面（`lib/utils/timeline.ts`）

```ts
import type { ScheduledPlace } from '@/lib/types'

export const PX_PER_MIN = 1.2        // 72px / 小時（可調）
export const MIN_CARD_PX = 36        // 極短停留的最小可讀高度
export const RESIZE_SNAP_MIN = 5     // resize 貼齊 5 分
export const MIN_DURATION_MIN = 5    // 停留時間下限

export interface TimelineCardLayout {
  id: string
  heightPx: number     // = max(durationMin * PX_PER_MIN, MIN_CARD_PX)
  travelGapPx: number  // 此卡片之後的空檔高度 = travelMin * PX_PER_MIN（最後一張為 0）
  travelMin: number    // 連接線標示用（0 表不顯示）
}

export interface TimelineLayout {
  dayStartMin: number
  dayEndMin: number
  totalPx: number      // 卡片高度 + 空檔總和（flow 堆疊的總高）
  cards: TimelineCardLayout[]
}

/** 依當天 places（已排序、含 startTime/durationMin/travelMinToNext）算出版面。動態範圍。 */
export function timelineLayout(places: ScheduledPlace[], pxPerMin?: number): TimelineLayout

/** resize：像素位移 → 貼齊後的新時長（含下限）。 */
export function pxToDuration(currentDurationMin: number, deltaPx: number, pxPerMin?: number): number

/** 刻度：回傳每個整點的 { min, labelTop, label }（HH:00）。 */
export function rulerTicks(dayStartMin: number, dayEndMin: number, pxPerMin?: number): { min: number; topPx: number; label: string }[]
```

**版面採 flow 堆疊（非絕對定位）**，避免 min-height 與絕對座標衝突：卡片與空檔在 DOM 中依序排列——`heightPx = max(durationMin × pxPerMin, MIN_CARD_PX)`，其後接一個高度 `travelGapPx = (travelMinToNext ?? 0) × pxPerMin` 的空檔（內放連接線）。左側刻度為平行欄位，用 `rulerTicks` 畫整點線；**當沒有 min-height 兜底時，卡片頂端與刻度精準對齊**；只有極短停留被 floor 撐高時，後續卡片會比真實時間略往下（可接受的取捨，換取可讀性）。

## 5. Resize 互動

- `TimelineCard` 底緣一條 grab 手把（`cursor-ns-resize`）。
- pointer down 記錄起始 Y → move 時 `previewDur = pxToDuration(place.durationMin, deltaY)` 即時改高度（本地 state 預覽，不每格觸發 recalc）。
- pointer up → `onTimeChange(place.id, 'durationMin', previewDur)` → 既有 `scheduleRecalc`（2 秒 debounce）reflow。
- `durationLocked` → 不渲染手把（顯示 🔒，與卡內鎖一致）。
- 手把的 pointer 監聽 `stopPropagation`，避免觸發 dnd-kit 的 reorder 拖曳（後者啟動距離 5px）。

## 6. 與既有功能並存

| 功能 | 時間軸視圖行為 |
|------|----------------|
| Reorder 拖曳（同天/跨天） | `TimelineCard` 同用 `useSortable` + 同一 `SortableContext`/`day-N` droppable；放開後 reflow（同清單） |
| 精確改時間 | `CardContent` 保留起訖 `TimeScrollPicker`，走 `onTimeChange`；resize 是另一條改時長的路徑 |
| 鎖 | `startLocked` 停用該卡 reorder 拖曳＋錨定；`durationLocked` 停用 resize；鎖鈕在 `CardContent` |
| 整天鎖開始/停留 | `TimelineDay` 沿用 `onSetDayStartLock/onSetDayDurationLock`（同 `ItineraryDay`） |
| 類型切換 | `CardContent` 內 `TypePicker` |
| 地圖 | `TimelineDay` 保留右側 sticky iframe |
| 警告 outsideHours/lateExit | `CardContent` 顯示，兩視圖一致 |
| 未來人潮 badge | 落在 `CardContent`，兩視圖自動都有 |

## 7. 切換鈕（`ItineraryClient`）

- 頂部一組切換：`📋 清單 / 🗓 時間軸`，控制 `viewMode`。
- `DndContext` 與每天的 `SortableContext` 不變；只是內層由 `viewMode` 決定渲染 `ItineraryDay`（清單）或 `TimelineDay`（時間軸）。
- `viewMode` 為 UI-only state（不進 `plan`、不觸發 recalc）。

## 8. 邊界情況

- 極短停留：`heightPx` 以 `MIN_CARD_PX` 兜底，內容截斷（`overflow-hidden`）。
- 很長的一天：容器可垂直捲動。
- 空的一天：刻度不渲染，顯示空狀態 droppable（可被拖入）。
- 含鎖定起始：刻度仍動態；reflow 尊重鎖（沿用 `recalcDay`）。
- `durationLocked`：無 resize 手把。
- 跨天拖曳進空白處：沿用 `day-N` droppable。

## 9. 測試（純函式優先，配合現有 Jest）

| 測試 | 重點 |
|------|------|
| `timeline.test.ts` `timelineLayout` | height/gap 計算（flow 堆疊）；min-height floor；動態範圍；最後一張 gap=0；totalPx 總和 |
| `timeline.test.ts` `pxToDuration` | 貼齊 5 分；最小時長下限；負位移縮短 |
| `timeline.test.ts` `rulerTicks` | 整點刻度數量與標籤、topPx |
| `TimelineCard` 元件 | `durationLocked` 不顯示 resize 手把；resize 放開呼叫 `onTimeChange('durationMin')` |
| `ItineraryClient` 切換 | 切到時間軸渲染 `TimelineDay`；清單模式不受影響（既有測試不回歸） |

## 10. 全域限制

- TypeScript strict，無 `any`。不新增 npm 套件（dnd-kit、現有工具已足夠；resize 用原生 pointer events）。
- UI 文案繁體中文。
- 既有清單視圖行為**零回歸**——抽 `CardContent` 時，`ItineraryCard` 對外行為與測試需維持。
- `lib/utils/timeline.ts` 為純函式單一來源；元件不重新實作版面數學。

## 11. 變更/新增檔案

| 檔案 | 動作 |
|------|------|
| `lib/utils/timeline.ts` | 新增：版面/ resize / 刻度純函式 |
| `components/CardContent.tsx` | 新增：共用卡片內容（自 `ItineraryCard` 抽出） |
| `components/TimelineCard.tsx` | 新增：時間軸卡片 + 下緣 resize |
| `components/TimelineDay.tsx` | 新增：刻度 + 等比例排列 + 地圖 |
| `components/ItineraryCard.tsx` | 修改：改用 `CardContent`（行為不變） |
| `app/itinerary/ItineraryClient.tsx` | 修改：`viewMode` state + 切換鈕 + 依模式渲染 |
| `__tests__/timeline.test.ts` | 新增：純函式測試 |
| `__tests__/timeline-card.test.tsx` | 新增：resize 手把 / 鎖 |

## 附：關聯
- 既有排程：`lib/utils/clientScheduler.ts`（`recalcPlan`，順序 reflow + 鎖錨定）
- 既有卡片/視圖：`components/ItineraryCard.tsx`、`components/ItineraryDay.tsx`、`app/itinerary/ItineraryClient.tsx`
- 人潮 badge（未來，落在 `CardContent`）：`docs/superpowers/specs/2026-06-28-crowd-data-layer-design.md`
