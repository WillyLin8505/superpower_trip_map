# AI 對話重排 Design Spec

**日期：** 2026-07-02
**子專案：** #8（roadmap 12 需求 → 9 子專案中的第 8 項，對應原始需求 req 5）
**依賴：** #2 行程日曆（dayStart/dayEnd）✅、#4 每段交通（套用後重算走 2 秒 leg recompute）✅、既有 `callClaude`（`lib/claude.ts`）
**狀態：** 設計定稿，待寫 plan

---

## 1. 目標

行程頁提供一個口語指令框（例：「第二天太滿，分一些到第三天」「第一天晚點開始」「把行程排鬆一點」）。AI 依指令重排後，**先列出所有將要做的變動、用天分類、每項可單獨 ✗ 刪除**，使用者按「一鍵同意全部」才套用「✗ 之後剩下的所有變動」。

### 範圍
AI 可產生三類變動：**搬移**（地點跨天移動）、**停留**（改某地點 `durationMin`）、**活動窗**（改某天 `dayStart`/`dayEnd`）。

### 非目標
- 不新增/刪除地點（地點集合不變）、不增減天數（天數不變）。
- **不含「同一天內重新排順序」**——同天細部順序交給拖曳或 #7 智慧排程。此限制讓三類變動彼此獨立、可任意 ✗ 而不互相牽連。
- 不做多輪對話記憶（每次指令獨立）。

---

## 2. 安全機制（AI 只能 permute，不能亂造）

- Prompt 給每個地點一個**短編號 `ref`（1..N，跨整份行程）**，AI 只用 ref 引用（不碰 UUID → 不幻覺假地點、輸出小）。
- AI 回傳「提議行程」後**硬驗證**：所有 ref 恰為 `1..N` 的排列（不缺不重）、天數不變、每天 `dayStart`/`dayEnd` 為合法 `HH:MM`、每個 `durationMin > 0`。任一不過 → 回錯誤、不產生任何變動。
- **鎖定**：prompt 告知哪些地點 `startLocked`/`durationLocked` 並請 AI 尊重。`durationLocked` 的地點在 `diffPlan` **不產生停留變動**（硬保留原時長）；`startLocked` 軟性尊重（靠逐項預覽把關）。

---

## 3. 資料流

```
使用者指令 + 目前 plan
  → rearrangeItinerary (server, 呼叫 callClaude)
      → 解析 + 驗證 AI 輸出 → 以 ref 映射建「提議 plan」
      → diffPlan(current, proposed) → Change[]
      → 回 { ok: true, changes, summary }（或 { ok:false, error }）
  → AiRearrangeInput 顯示 changes（用天分類、每項 ✗）
  → 使用者 ✗ 掉部分 → 剩下 accepted: Change[]
  → 「一鍵同意全部」→ applyChanges(current, accepted) → newPlan
  → onApply(newPlan) → ItineraryClient.scheduleRecalc(newPlan, true)（重算時間 + 2 秒 leg 重算）
```

---

## 4. 變動模型（純函式核心）

新檔 `lib/utils/rearrangeChanges.ts`：

```ts
type Change =
  | { id: string; day: number; kind: 'move';     placeId: string; placeName: string; toDay: number }
  | { id: string; day: number; kind: 'duration'; placeId: string; placeName: string; from: number; to: number }
  | { id: string; day: number; kind: 'window';   field: 'dayStart' | 'dayEnd'; from: string; to: string }

function diffPlan(current: PlanResult, proposed: PlanResult): Change[]
function applyChanges(current: PlanResult, accepted: Change[]): PlanResult
```

- `day` = 該變動在 UI 中歸屬的天（搬移歸**來源天**；停留/活動窗歸該地點/該天所在天）。
- `id` = 穩定鍵（`move-{placeId}` / `dur-{placeId}` / `win-{day}-{field}`），供 React key 與接受集合使用。

**`diffPlan`**（比較目前 vs 提議）：
- 每個地點：目前天 ≠ 提議天 → 一個 `move`（`day`=目前天、`toDay`=提議天）。目前 `durationMin` ≠ 提議且**非 durationLocked** → 一個 `duration`。
- 每天：`dayStart`/`dayEnd` 有變 → 對應 `window`（每個欄位各一項）。

**`applyChanges`**（把被接受的變動套到**目前 plan 的複本**；三類彼此獨立）：
1. `duration`：依 placeId 設 `durationMin`（durationLocked 保留原值作安全網）。
2. `window`：設該天 `dayStart`/`dayEnd`。
3. `move`：把地點從來源天移除、**append 到目的天末端**（同天內既有順序不變）。
4. 回傳 newPlan（時間先不算，由呼叫端 recalc）。

子集安全：任一變動對「目前 plan」皆可獨立套用，✗ 掉任何項都不影響其他項的正確性。決定性（無隨機/時間相依）。

---

## 5. 伺服器動作

新檔 `app/actions/rearrange.ts`：
```ts
type RearrangeResult =
  | { ok: true; changes: Change[]; summary: string }
  | { ok: false; error: string }

function rearrangeItinerary(plan: PlanResult, instruction: string): Promise<RearrangeResult>
```
- 建 prompt：列出每個地點 `ref、名稱、類型、目前第幾天、停留分鐘、是否鎖開始/鎖停留`，每天的 `dayStart/dayEnd`，加上使用者 instruction；要求 AI 回**純 JSON**：
  ```json
  { "summary": "已把第二天的 A、B 移到第三天，第一天改 10:00 開始",
    "days": [ { "day": 1, "dayStart": "10:00", "dayEnd": "21:00", "places": [ { "ref": 3, "durationMin": 90 } ] } ] }
  ```
- `callClaude`（既有，Anthropic SDK，haiku）→ 沿用既有「去 markdown fence + 取 JSON + parse」模式，失敗回 `{ ok:false, error }`。
- 驗證（§2）→ 以 ref 映射把提議建成 `PlanResult`（沿用目前 ScheduledPlace 物件、套 AI 的天/時長/窗）→ `diffPlan(current, proposed)` → 回 `changes + summary`。
- ref 使輸出精簡，預期在 `callClaude` 現有 `max_tokens: 1024` 內；若日後大行程有截斷風險，再於 `lib/claude.ts` 加可選 `maxTokens` 參數（本案不強制）。

---

## 6. UI

新元件 `components/AiRearrangeInput.tsx`（自管輸入/loading/預覽/錯誤狀態）：
- textarea（placeholder 例：「第二天太滿，分一些到第三天」）+「重排」按鈕。
- 進行中 → 按鈕 disabled + loading 文案「AI 重排中…」。
- 成功 → 預覽面板：`summary` 一行 + 變動**用天分類**列出（`第 N 天` 標頭下列該天變動，每項一行 + ✗ 移除鍵）+ 「一鍵同意全部」+「取消」。
  - ✗ → 從接受集合移除該項（該行淡出/移除）。
  - 一鍵同意全部 → `applyChanges(plan, accepted)` → `onApply(newPlan)`；清空預覽。
  - 取消 → 丟棄整個提議、回到輸入狀態。
- 失敗 → 錯誤提示「AI 重排失敗，請換個說法再試」，行程不動。
- 變動文案（繁中）：
  - `move`：`{placeName} 移到第 {toDay} 天`
  - `duration`：`{placeName} 停留 {from} → {to} 分`
  - `window`：`活動{field==='dayStart'?'開始':'結束'} {from} → {to}`
- 位置：行程頁頂部（日期列附近）一個可收合的「AI 重排」區塊。

---

## 7. 架構與 Lane C 衝突控制

重活放新檔，`ItineraryClient` 只加最小改動（降低與 Lane C auth+persistence 在 `ItineraryClient` 的重疊）：

| 檔案 | 責任 |
|---|---|
| `lib/utils/rearrangeChanges.ts`（新，純） | `Change` 型別、`diffPlan`、`applyChanges` |
| `app/actions/rearrange.ts`（新，server） | `rearrangeItinerary`：prompt + `callClaude` + 驗證 + `diffPlan` |
| `components/AiRearrangeInput.tsx`（新） | 輸入 + 預覽清單（✗ / 一鍵同意全部）+ 錯誤 |
| `app/itinerary/ItineraryClient.tsx`（改，最小） | 渲染 `<AiRearrangeInput plan={plan} onApply={handleAiApply} />` + `handleAiApply(newPlan) = scheduleRecalc(newPlan, true)` |

---

## 8. 邊界與錯誤處理

- AI 掛 / JSON 壞 / 驗證不過 → 錯誤提示、行程不動、不顯示任何變動。
- AI 回傳「無變動」（提議 == 目前）→ `changes` 為空 → 顯示「沒有需要調整的地方」。
- 全部被 ✗ 掉 → 「一鍵同意全部」等同無操作（或 disabled）。
- `move` 目的天為空天 → 允許（該天原可為空）。
- 套用後某天變空 → 沿用既有空天顯示（#6 無 pill、#3 缺住宿提醒等既有行為）。
- 決定性：`diffPlan`/`applyChanges` 純函式、同輸入同輸出。

---

## 9. 測試策略（TDD）

純函式（重點，單元）：
- `diffPlan`：跨天 → `move`；改時長 → `duration`（durationLocked 不產生）；改窗 → `window`（每欄位各一）；無變動 → `[]`。
- `applyChanges`：套 `move`（來源移除、目的 append）；套 `duration`（durationLocked 保留原值）；套 `window`；**子集**（✗ 掉部分 → 只套剩下的、其餘不受影響）；決定性。
- ref 驗證輔助（若抽出）：非 1..N 排列 → 視為無效。

伺服器動作（mock `callClaude`）：
- 合法 AI JSON → 回對應 `changes + summary`；壞 JSON / ref 不合法 / 天數不符 → `{ ok:false }`。

元件（jsdom，mock `rearrangeItinerary`）：
- 輸入 + 重排 → 顯示用天分類的變動 + ✗；✗ 一項後「一鍵同意全部」→ `onApply` 收到只套用剩餘項的 newPlan；取消 → 回輸入；失敗 → 錯誤提示、不 onApply。
- ItineraryClient：`handleAiApply` → plan 更新（mock scheduleRecalc 或驗證 setPlan）。

既有全測試需保持綠。

---

## 10. 全域約束

- TypeScript strict，無 `any`。不新增 npm 套件（`@anthropic-ai/sdk` 已在）。
- UI 文案繁體中文。
- 決定性驗證與套用（純函式核心）。
- AI 只能 permute 現有地點（ref 排列 + 硬驗證），不新增/刪除地點或天數。
- `ItineraryClient` 改動最小化（避 Lane C 衝突）；重活在新檔。
