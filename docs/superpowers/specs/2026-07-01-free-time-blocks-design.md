# 空閒時間區塊顯示 Design Spec

**日期：** 2026-07-01
**子專案：** #6（roadmap 12 需求 → 9 子專案中的第 6 項，對應原始需求 req 8 的 display 部分）
**依賴：** #4 每段交通時間 ✅（空閒需扣除每段交通）、#5 拆分時間鎖 ✅（鎖定造成的 slack 是主要空閒來源）
**狀態：** 設計定稿，待寫 plan

---

## 1. 目標

在每天的卡片串中，於出現空閒（idle）的位置穿插一個低調的「空閒時間」區塊，讓使用者一眼看到「這裡有多少可用時間」。純衍生顯示，不新增任何儲存欄位。

### 非目標
- 不主動填空閒（插入推薦景點）——屬其他子專案。
- 不提供任何動作（重排交給 #7）。
- 不動 `ItineraryClient` 或資料層——純顯示，且刻意避開與 Lane C（auth+persistence）的熱點檔衝突。
- 不顯示「天首空閒」（dayStart→第一張卡）——極少發生、易顯得囉唆。

---

## 2. 空閒的定義與來源

行程時間為背對背排（`recalcDay` 的 cursor `+= 停留 + 交通`），故空閒只在少數位置出現：

- **卡片間空閒**：`gap(i) = start(i+1) − ( start(i) + durationMin(i) + travelMinToNext(i) )`
  - 主要來自 `startLocked` 地點造成的 slack（前段填不滿到鎖定時間）。
- **一天結尾剩餘**：`remaining = dayEndMin − ( start(last) + durationMin(last) )`

其中 `start(x)` = `ScheduledPlace.startTime` 轉分鐘，`dayEndMin` = `day.dayEnd` 轉分鐘。

**顯示門檻：** 空閒 **≥ 15 分** 才顯示。小於 15 分、`0`、負值（重疊/溢出）一律不顯示。空的天（無卡片）不顯示任何區塊。

---

## 3. 計算（純函式）

新檔 `lib/utils/freeTime.ts`：
```ts
interface FreeBlock {
  afterId: string        // 此空閒排在哪張卡之後（卡片 id）
  minutes: number        // 空閒分鐘（≥ minGapMin）
  untilTime?: string     // 僅天尾區塊帶：'HH:MM'（= dayEnd）
}

function freeBlocks(
  places: ScheduledPlace[],
  dayEndMin: number,
  minGapMin?: number       // 預設 15
): FreeBlock[]
```
規則：
- `places.length === 0` → 回 `[]`。
- 卡片間：對 `i` in `0..n-2`，算 `gap(i)`；若 `gap(i) >= minGapMin` → push `{ afterId: places[i].id, minutes: gap(i) }`。
- 天尾：算 `remaining`；若 `remaining >= minGapMin` → push `{ afterId: places[n-1].id, minutes: remaining, untilTime: minsToTime(dayEndMin) }`。
- 純函式、決定性（無隨機/時間相依）。

> `freeBlocks` 全程以 `dayEndMin`（分鐘）計算；天尾 `untilTime` 由 `minsToTime(dayEndMin)`（既有 `lib/utils/time.ts` 的 `minsToTime`）轉回 `'HH:MM'`，結果與原 `day.dayEnd` 字串相同（呼叫端以 `toMin(day.dayEnd)` 傳入），故自成一體、不需另外傳字串。

---

## 4. 顯示格式（繁體中文）

顯示文字：`⏱ 空閒 {label}`，`label` 由分鐘數格式化（新純函式 `formatGap(minutes)`）：
- `< 60` → 「N 分」（例：`空閒 40 分`）
- `>= 60` 且整除 60 → 「N 小時」（例：`空閒 5 小時`）
- `>= 60` 且有餘 → 「N 小時 M 分」（例：`空閒 1 小時 20 分`）

天尾區塊在 `label` 後追加「（到 {untilTime}）」（例：`空閒 5 小時（到 21:00）`）。

---

## 5. UI（`components/ItineraryDay.tsx`）

在每天卡片串（現有 `day.places.map(...)` 渲染 `ItineraryCard` 之處）穿插空閒區塊：
- 先以 `freeBlocks(day.places, toMin(day.dayEnd))` 算出區塊；建一個 `afterId → FreeBlock` 的查找。
- 渲染時，每張卡片之後，若該卡 id 在查找中 → 接著渲染一個空閒 pill。
- pill 樣式：低調、與卡片區分（灰底 `bg-gray-100`、圓角、小字、⏱ 圖示、置中或縮排對齊卡片內容）。`data-testid="free-block-{afterId}"` 便於測試。

只改 `ItineraryDay.tsx`（與新純函式檔）；不動 `ItineraryClient`、`ItineraryCard`、資料層。

---

## 6. 邊界與錯誤處理

- 空的天 → 無區塊。
- 全部背對背（無 slack、天尾 <15 分）→ 無區塊（正常）。
- 負 gap（鎖定衝突造成重疊/溢出）→ 不顯示（門檻 `>= 15` 天然排除）。
- 單張卡片的天：無卡片間空閒；只可能有天尾區塊。
- `untilTime` 一律取 `day.dayEnd`（該天活動結束），與 #2 的每天活動窗一致。

---

## 7. 元件與職責邊界

| 檔案 | 職責 |
|---|---|
| `lib/utils/freeTime.ts`（新） | `freeBlocks`（計算）+ `formatGap`（格式化）純函式 |
| `components/ItineraryDay.tsx`（改） | 卡片串中穿插空閒 pill（衍生自 `freeBlocks`） |

---

## 8. 測試策略（TDD）

純函式（單元）：
- `freeBlocks`：
  - 卡片間 slack ≥15 → 產生區塊（`afterId` 正確、分鐘正確）。
  - slack <15 / 0 / 負值 → 不產生。
  - 天尾剩餘 ≥15 → 產生帶 `untilTime` 的區塊；<15 → 不產生。
  - 空天 → `[]`；單卡天 → 僅可能天尾。
- `formatGap`：40→「40 分」、60→「5 小時」型式（60→「1 小時」、80→「1 小時 20 分」、300→「5 小時」）。

元件（jsdom）：
- `ItineraryDay`：卡片間 slack 造成的 pill 出現在正確卡片之後、文字正確；天尾 pill 帶「（到 HH:MM）」；<15 分不出現；空天無 pill。

既有全測試需保持綠（純新增，不改既有渲染邏輯，只在 map 內插入條件式 pill）。

---

## 9. 全域約束

- TypeScript strict，無 `any`。不新增 npm 套件。
- UI 文案繁體中文。
- 純衍生顯示 → 零 fixture 遷移。
- 決定性（同輸入同輸出）。
- 只改 `ItineraryDay` + 新純函式檔；不動 `ItineraryClient`/資料層（降低與 Lane C 的衝突面）。
