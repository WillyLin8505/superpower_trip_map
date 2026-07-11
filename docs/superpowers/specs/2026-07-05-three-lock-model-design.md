# 三鎖模型（開始/停留/結束）+ 鎖不影響拖曳 Design Spec

**Goal:** 把目前的兩鎖(開始/停留)擴充為三鎖(開始/停留/結束),三者以 `結束 = 開始 + 停留` 相繫;鎖任兩個 → 第三個自動衍生並顯示為鎖定。同時把「鎖」與「拖曳」**徹底解耦**:鎖只是時間限制,任何卡片永遠可拖,拖曳只改順序,鎖定的時間值不變。

**Supersedes:** `docs/superpowers/specs/2026-06-28-split-time-lock-design.md`(兩鎖、獨立、鎖開始=不可拖)。本案改為三鎖、可衍生、且鎖不再禁止拖曳。

## 背景(現況)

- `ScheduledPlace` 只有 `startLocked`、`durationLocked` 兩個布林。無結束鎖。
- `startLocked` 同時做兩件事:(a) 把開始時間釘死當排程錨點;(b) 讓卡片**不可拖**(`useSortable({ disabled })` + 隱藏 drag handle)。
- `durationLocked` 只固定停留時長,仍可拖。
- 結束時間永遠是 `開始 + 停留` 的算術衍生,無法當作鎖定/錨點輸入。
- 排程 `recalcDay`(`lib/utils/clientScheduler.ts`)只以 `startLocked` 為錨點,前後回填。

## 1. 鎖語意

三個鎖:`startLocked`、`durationLocked`、`endLocked`,受 `end = start + duration` 約束(2 個自由度)。

1. **鎖 = 純時間限制,與拖曳/順序解耦。** 只要清單可拖,**每張卡片永遠可拖**;鎖定不隱藏 drag handle、不 disable sort。拖曳只改順序,鎖定的時間值不變(例:鎖開始 14:00 的卡片拖到別處,開始仍是 14:00,其他地點繞著它排)。
2. **鎖任兩個 → 第三個自動衍生、顯示為鎖定。** 第三個的值由另外兩個算出,其 toggle 於此時 **disabled**;要改它需先解開另外兩個之一。鎖 0 或 1 個時,其餘保持自由。
3. **排程尊重被釘住的時間:**
   - **開始鎖** → start 釘死(現有錨點行為)。
   - **結束鎖(單獨)** → **往前回推**:`start = end − duration`。停留自由,故改停留會移動開始。
   - **停留鎖** → 系統不得為塞進預算而縮短該停留(現有行為)。
   - 兩鎖組合(第三衍生):
     - 開始+停留 → 結束衍生(等同今日 start+duration)。
     - 開始+結束 → 停留衍生(`duration = end − start`)。
     - 結束+停留 → 開始衍生(`start = end − duration`)。

## 2. 資料模型

採「三布林」方案(最小擴充,沿用現有兩布林模式):

```ts
// lib/types.ts ScheduledPlace 追加
endLocked: boolean   // 鎖結束時間
```

- `startLocked`、`durationLocked` 保留原義。
- **衍生第三鎖的表示法:** 使用者實際點按而 `true` 的鎖最多 2 個;當 2 個為 `true`,第三個由 UI 視為「自動鎖定(衍生)」——**不寫入第三個布林**,而是在算「有效釘住的時間」時,把「兩鎖 → 第三衍生」視為第三者亦被釘住。排程只關心「哪些 facet 被釘住」,兩鎖時三者其實都一致固定。
  - 具體:`effectivePinned(place)` = 由 `startLocked/durationLocked/endLocked` 推出的 `{ start: bool; duration: bool; end: bool }`;若其中兩個為 true,第三個亦視為 true(衍生)。

> 為何不新增第三個「衍生」旗標:衍生純為兩鎖的數學結果,存布林會製造需同步的重複狀態。以 `effectivePinned` 純函式即時推導,單一真相。

## 3. 互動 / UI

### 卡片(`ItineraryCard`;timeline 版 `TimelineCard`/`CardContent`)

- **三個鎖 toggle**,置於現有 開始/停留 的位置:`🔒/🔓 開始`、`🔒/🔓 停留`、`🔒/🔓 結束`。
- **衍生第三鎖:** 當另外兩個都鎖,第三個顯示 `🔒`(鎖定樣式)但 **disabled**,`title="由另外兩個鎖自動決定"`。解開其中一個 → 第三個恢復可按。
- **時間編輯器依自由 facet 呈現:** 被鎖或衍生的 facet 顯示為靜態文字 + 🔒;仍自由的 facet 保留 picker。
  - start picker 顯示 iff 開始未鎖且非衍生。
  - end picker 顯示 iff 結束未鎖且非衍生(end picker 編輯等同調整停留;停留鎖時 end 隨 start 靜態顯示)。
  - 具體 picker 佈線於 plan 階段定案;規則以「顯示自由 facet 的編輯器,鎖/衍生者靜態」為準。
- **drag handle 永遠顯示**(清單可拖時);鎖定不再隱藏它。list 與 timeline 卡片皆同。

### 每天標頭「整天鎖」

- 保留現有兩顆:`整天鎖開始`、`整天鎖停留`。
- **不新增**「整天鎖結束」——「某時間前結束」本質是逐點情境,第三顆全天鈕會雜亂。(未來需要再加。)

## 4. 排程(`lib/utils/clientScheduler.ts` `recalcDay` / `lib/utils/arrangeDay.ts`)

- **一般化錨點:** 一個地點若 **開始被釘**(錨在 start)**或 結束被釘**(錨在 `end − duration`)即為時間錨點。現有前後回填邏輯繞著任一種錨點運作。
- 結束鎖(單獨)→ 該地點 `start = end − duration`,以此為錨。
- 停留鎖 → 不自動縮短(不變)。
- `extendLastAccommodation`:延伸最後住宿至 `dayEnd` 時,若該住宿 **結束被釘** 則不延伸(比照現有對 `durationLocked` 的處理)。
- **衝突**(兩錨點在既有順序/交通下無法同時滿足)→ 盡力擺放,不硬性阻擋;以既有 `超出營業時間` / 本專案新增的 `超出當天活動時間` 提醒讓使用者看見。

## 5. 拖曳解耦(`ItineraryCard`、`TimelineCard`)

- `useSortable({ id, disabled: !draggable })` —— **移除** `|| place.startLocked`。
- drag handle 顯示條件由 `draggable && !place.startLocked` 改為 **`draggable`**。
- 結果:任何鎖狀態的卡片皆可拖;拖曳後排程依 §4 把被釘時間放回原位。

## 6. 錯誤處理 / 邊界

- 全部三鎖被使用者硬點(理論上第三為衍生、不該能點)→ UI 以 disabled 防止;若資料異常同時為 true,`effectivePinned` 仍一致(三者皆 pinned)。
- 鎖結束早於（開始 + 最小停留）等不合理值 → 排程盡力、以提醒呈現,不阻擋。
- 匿名/既有測試:`endLocked` 為新欄位;為降低衝擊,型別上設為**必填布林**但所有既有 `ScheduledPlace` 建構點需補 `endLocked: false`(建構點集中於少數 helper 與 server 初排;plan 階段逐一補)。若衝擊過大改為可選 `endLocked?: boolean`,讀取以 `?? false` 收斂。

## 7. 測試(TDD)

- **衍生 handler:** 鎖兩個 → 第三個 `effectivePinned` 為 true 且該 toggle disabled。
- **排程:**
  - 結束鎖(單獨)→ `start = end − duration` 回推。
  - 開始鎖 → 錨在 start(回歸)。
  - 結束+停留 → start 衍生固定。
- **拖曳:** 開始鎖的卡片 `useSortable` **未** disabled、drag handle 仍在。
- **卡片 UI:** 三個 toggle 皆渲染;兩鎖時第三個 disabled + 提示文案。
- **回歸:** 既有兩鎖行為(開始錨點、停留不縮短)不破。

## 8. 檔案影響

| 檔案 | 變更 |
|---|---|
| `lib/types.ts` | `ScheduledPlace` 加 `endLocked` |
| `lib/utils/lockDerive.ts`(新) | `effectivePinned(place)` 純函式 + 「兩鎖推第三」規則 |
| `lib/utils/clientScheduler.ts` | `recalcDay` 一般化錨點(start 或 end);`extendLastAccommodation` 尊重 endLocked |
| `lib/utils/arrangeDay.ts` | 錨點判定納入 endLocked |
| `components/ItineraryCard.tsx` | 第三 toggle、衍生 disabled、時間編輯器依自由 facet、drag 解耦 |
| `components/CardContent.tsx` / `components/TimelineCard.tsx` | 同上(timeline 版) |
| `components/ItineraryDay.tsx` / `components/TimelineDay.tsx` | 傳遞新的 toggle handler(整天鎖維持兩顆) |
| `app/itinerary/ItineraryClient.tsx` | `toggleLockField` 納入 `endLocked`;衍生規則 |
| 各建構 `ScheduledPlace` 之處 | 補 `endLocked: false` |

## Self-Review

- **Placeholder scan:** picker 佈線細節明列「plan 階段定案」,屬環境相依實作指引,非 TBD。其餘皆明確。
- **一致性:** 「鎖不影響拖曳」貫穿 §1/§3/§5;「兩鎖推第三」以 §2 `effectivePinned` 單一真相貫穿 §1/§3/§4。
- **範圍:** 聚焦三鎖 + 拖曳解耦,單一 plan 可實作。整天鎖結束、picker 微佈線明列取捨。
- **歧義:** `endLocked` 必填 vs 可選於 §6 給定預設(必填 + 補 false;衝擊過大則可選 + `?? false`),plan 依實際建構點數量定案。
