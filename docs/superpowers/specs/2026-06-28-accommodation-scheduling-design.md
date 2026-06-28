# 住宿排程語意 Design（Spike）— 子專案 #3 / 需求 10

**日期：** 2026-06-28
**狀態：** ✅ Spike 完成（PoC 已驗證）→ **實作交接 Lane A**（見 §9 Handoff）
**Lane：** B（與 [需求 4 人潮資料](../spikes/2026-06-28-crowd-data-findings.md) 同 lane）
**分支：** `lane/ai-research`

> 本文件為**決策/設計文件 + PoC**，**不改任何核心檔案**。住宿排程的正式實作待 Lane A 核心資料模型穩定後，以本文件為基礎再排進主線。

> **Lane A 修訂（2026-06-28）：** 依使用者回饋更新兩點——
> 1. **DAY_BUDGET 不再是寫死的 480 分**，改為**每日活動時間窗**：`DAY_BUDGET = 每日活動結束時間 − 開始時間`。活動時間窗由 #2 行程日曆日期 spec 定義（預設 09:00–21:00），見 §3.1。
> 2. **停留時間可由系統調整**（為了塞進預算），但當某地點的 `durationMin` **小於其「建議停留時間」**時要顯示提醒，見 §3.3。

---

## 1. 目標與範圍

需求 10：住宿不再只是「比照景點排入」的佔位（子專案 #1 的暫定行為），而是有**真正的排程語意**：每晚不同飯店，每天從昨晚飯店出發、晚上排回當晚飯店。

**確定的模型（來自 brainstorming）：**
- **多間飯店、每晚不同**；系統**自動推斷**住宿順序 + 把景點依地理分群到各天。
- 住宿純當**地理錨點**，**不管 check-in/out 時間**。
- **飯店數 = 夜數，天數 = 夜數 + 1**（例：3 飯店 = 3 晚 = 4 天）。
- 採 **Approach B：先分群（cluster-first）**，做成**決定性**版本。
- 分群政策＝**累進填滿（fill-forward）**：優先把前面的天排滿，塞不下才往後溢到隔天，最後一天承接剩餘——**刻意不平分**（使用者明確指定）。

**本 spike 範圍（Lane B 中間段）：**
- 把景點依地理**分群到各飯店夜**。
- 每天「昨晚飯店 → 今晚飯店」的端點固定走法。

**不在範圍（Lane A 負責）：**
- Day 1 的起點錨（抵達點）。
- 最後一天（回家那天）的結束時間。
- 卡片 UI、type 標籤、顏色（子專案 #1 已完成）。

### 天 / 夜 / 飯店對應

| 天 | 起點錨 | 終點錨 | 負責 |
|----|--------|--------|------|
| Day 1 | （抵達點，Lane A） | Hotel 1 | 起錨 Lane A、終錨本 spike |
| Day 2 | Hotel 1 | Hotel 2 | 本 spike |
| Day k (2..N) | Hotel k-1 | Hotel k | 本 spike |
| Day N+1（最後） | Hotel N | （回家，Lane A） | 起錨本 spike、結束 Lane A |

---

## 2. 為什麼需要 spike（核心不確定性）

現有 pipeline（`app/actions/optimize.ts` + `app/actions/schedule.ts`）是：

```
全域 NN+2-opt 排一條長路線  →  schedulePlaces 按「數量」平均切天  →  餐別時段排程
```

住宿錨點打破中間那一步——天的邊界不再是「數量平均」，而是「**由飯店夜的地理位置決定**」。需要驗證的真實未知：

1. 累進填滿的就近分群，能不能在真實座標上分出**地理合理**的結果（前面排滿、溢到後面、不平分）？
2. 端點固定 2-opt（起訖飯店釘死）會不會和現有 `twoOpt`（只釘 index 0）衝突？要改多少？
3. 決定性（同輸入同輸出）能否維持，以便寫測試？

PoC（第 6 節）就是要把 1 跑出來看。

---

## 3. Approach B — 決定性「容量感知就近分群」演算法

> 關鍵洞察：**飯店本身就是各群的中心**，所以不必隨機初始化分群中心、也不會每次跑出不同結果——這就解掉了一般 k-means「結果不穩定」的缺點。

### 3.1 步驟

1. **排住宿順序（夜 1→N）**
   把 K 間飯店座標兩兩算 `haversineSeconds`，用既有 `nearestNeighbor` + 端點自由 `twoOpt` 串成一條最順的鏈，定義夜 1→夜 N 的順序。
   - 種子起點：暫定「離所有景點重心（centroid）最近的飯店」當夜 1（決定性）。PoC 要驗證這個種子是否合理；若不佳，改由 Lane A 傳入的抵達點決定。

2. **就近 home-night + 累進填滿（核心；使用者指定「不平分、只溢一天」）**
   每天有時間預算上限 `DAY_BUDGET_MIN`＝**每日活動結束時間 − 開始時間**（活動時間窗由 #2 定義，預設 09:00–21:00 = 720 分；含景點停留，不含交通）。不再使用寫死的 480。
   - **先歸夜**：每個景點算到各飯店夜的 haversine，歸到**最近的那一夜（home night）** → 每天**先以飯店周圍景點為主**。
   - **home 優先吃預算**：每夜的 home 景點依「離當晚飯店」近→遠排隊（平手用 placeId 字典序），優先吃滿當天預算。
   - **只溢一天**：home 超過預算的部分**只往後溢到緊鄰的下一夜**；被溢到的景點**直接釘住、不再往後溢（不跨兩天）**，即使讓那天超出預算也接受。
   - **起點恆為住宿**：溢來的景點地理上靠近「昨晚飯店」＝那天早上的出發點，故在端點固定路線中自然排在**起點飯店之後的第一段**；**每天起點永遠是飯店錨點，不因溢出改變**。
   - **最後一夜承接所有剩餘**（不擋預算；可能超量 → 由既有 `outsideHours`/`lateExit` 警告）。
   - 結果：**前面的天先排滿自己周圍景點、超量只溢一天、最後一天吸收剩餘——刻意不平分**。決定性（同輸入同輸出）。

3. **每天端點固定走法**
   當天景點 + 起點飯店（昨晚）+ 終點飯店（今晚）組成節點；用**端點固定**的 2-opt 排序：起點、終點釘死，只重排中間景點，讓「昨晚飯店 → … → 今晚飯店」最不繞路。

4. **接回現有排程**
   每天排好的「起飯店 + 景點 + 終飯店」順序，交給既有 `schedulePlaces` 的時段邏輯填時間（餐廳午晚餐、`outsideHours`/`lateExit` 警告維持不變）。住宿節點不綁餐別，只當路徑端點。

### 3.2 對既有程式的衝擊（只說明，不在 spike 改）

| 既有 | 現況 | 需求 10 需要 |
|------|------|-------------|
| `optimize.ts` `twoOpt` | 只釘 index 0（起點），終點會浮動 | 需要**端點皆釘**的變體：迴圈 `i` 從 1、`j` 到 `length-2`，不動最後一個節點。小改即可，建議新增 `twoOptFixedEnds(route, matrix)` 而非改原函式。 |
| `schedule.ts` `schedulePlaces` | 按 `Math.ceil(places/days)` 數量切天 | 改由「分群結果」決定每天成員；切天邏輯被住宿分群取代。 |
| `lib/types.ts` | `Place`/`DayItinerary` | 提案見第 4 節（可選欄位，零破壞）。 |

### 3.3 停留時間可由系統調整 + 低於建議提醒（Lane A 修訂）

- 每個地點有一個**建議停留時間** `suggestedDurationMin`：現階段＝`DWELL[type]`（住宿 60／景點 90／餐廳・甜點 60）；未來由 Google／人潮估時取代（#7）。
- 當一天的景點**總停留時間超過 `DAY_BUDGET`** 時，除了既有的「只溢一天」機制，系統**可以縮短**該天地點的 `durationMin` 以塞進預算（系統有權更改停留時間）。
- 只要某地點的 `durationMin < suggestedDurationMin`（不論是系統縮短或使用者手動調短），就在卡片顯示**提醒**（新警告旗標，比照 `outsideHours`／`lateExit` 的呈現），文案如「停留時間少於建議（建議 N 分）」。
- `durationLocked`（見拆分鎖 spec）的地點**系統不得縮短**其停留時間；系統只調整未鎖停留的地點。
- 警告為**衍生顯示**，不阻擋；使用者仍可自行決定。

---

## 4. 資料模型建議（只建議，待 Lane A 對齊命名）

```ts
// lib/types.ts — 皆為可選/新增，零破壞既有 optimizer
// accommodation 類型已由子專案 #1 加入 PlaceType。

// 推斷出的住宿夜序，寫在 accommodation 類型的 Place 上：
//   nightIndex?: number   // 1-indexed，第幾晚；非住宿地點為 undefined

// DayItinerary 加上當天起訖錨（皆可選；Day1 起錨、末日終錨由 Lane A 補）：
//   startAnchor?: Place    // 昨晚飯店
//   endAnchor?: Place      // 今晚飯店
```

- `DWELL.accommodation` 目前為 60（子專案 #1 佔位）。住宿當端點不佔「遊覽時間」，PoC 預算計算時**不把住宿停留算進 DAY_BUDGET**。

---

## 5. 邊界情況（spike 要回答 / 文件要釘死）

| 情況 | 處理 |
|------|------|
| 飯店有座標但附近完全沒景點 | 那天只有飯店本身（合法、可接受）。 |
| 某景點離所有飯店都很遠 | 仍分給最近未滿的夜，並標記（未來可提醒使用者）。 |
| 只有 1 間飯店 | 退化：夜數=1、天數=2；夜1為終點錨、Day2 從夜1飯店出發。 |
| 景點總時間塞不下總預算 | 不強制塞；沿用既有 `outsideHours`/`lateExit` 警告。某些景點可能溢出最後一夜。 |
| 兩間飯店座標極近（同區換宿） | 鏈排序仍可運作；分群會因預算把景點分到兩夜，合理。 |
| 飯店數 ≥ 景點數 | 部分夜沒有景點 → 該天只有飯店（同第 1 列）。 |

---

## 6. PoC 計畫

**目的**：用一組真實座標驗證「容量感知就近分群 + 端點固定 2-opt」能分出**地理合理、每天平均**的結果。

- 獨立檔 `docs/superpowers/spikes/accommodation-poc.ts`，**零相依、不接主程式**，重用 haversine 與 2-opt 概念（內嵌簡化版以便單檔執行）。
- 範例資料：東京 3 飯店（淺草／新宿／台場一帶）+ 8–10 個景點。
- 輸出：(a) 推斷的住宿夜序；(b) 每夜分到哪些景點 + 當天總停留時間（看平衡）；(c) 每天端點固定排序後的順序。
- 把實跑輸出貼回本文件 §7 佐證。

> 與人潮 spike 一樣：這是 spike 內可**完全自跑**的部分（不需任何 API key），故直接執行並附結果。

---

## 7. PoC 實跑結果（已實際執行）

範例：東京 3 飯店 + 9 景點。

**(a) 寬預算（8h/天，每個分區自然塞得下）：**
```
住宿夜序： 夜1 台場Hotel / 夜2 淺草Hotel / 夜3 新宿Hotel
分群（累進填滿、不平分）：
   夜1 (台場Hotel)  4h30： 台場海濱公園 / 富士電視台 / 豐洲市場
   夜2 (淺草Hotel)  4h30： 雷門/淺草寺 / 東京晴空塔 / 上野公園
   夜3 (新宿Hotel)  4h30： 新宿御苑 / 明治神宮 / 澀谷十字路口
每天端點固定路線（起=昨晚, 終=今晚）：
   Day 1: 台場海濱公園 → 豐洲市場 → 富士電視台 → 🏨台場Hotel
   Day 2: 🏨台場Hotel → 上野公園 → 東京晴空塔 → 雷門/淺草寺 → 🏨淺草Hotel
   Day 3: 🏨淺草Hotel → 澀谷十字路口 → 明治神宮 → 新宿御苑 → 🏨新宿Hotel
   Day 4: 🏨新宿Hotel （末日：回家，Lane A 負責）
```

**(b) 緊預算（3h/天 = home 每天約 2 個，逼出溢出）—— 驗證「只溢一天 + 起點恆為住宿」：**
```
分群（home 優先、只溢一天、不平分）：
   夜1 (台場Hotel)  3h00： 台場海濱公園 / 富士電視台              ← home 排滿；豐洲超量
   夜2 (淺草Hotel)  4h30： 豐洲市場 / 雷門/淺草寺 / 東京晴空塔     ← 豐洲(夜1溢來,釘住) + 淺草home 2
   夜3 (新宿Hotel)  6h00： 上野公園 / 新宿御苑 / 明治神宮 / 澀谷十字路口  ← 上野(夜2溢來) + 新宿home 3
每天路線（起=昨晚飯店）：
   Day 2: 🏨台場Hotel → 豐洲市場 → 東京晴空塔 → 雷門/淺草寺 → 🏨淺草Hotel
          （豐洲＝夜1溢來，地理近台場＝今早出發點，故排在起點飯店之後第一站）
```
- **驗證①「只溢一天」**：豐洲（home＝夜1）只到夜2 就釘住，**沒有再跨到夜3**。
- **驗證②「起點恆為住宿」**：每天 Day k 起點都是昨晚飯店；溢來景點順排其後。

**結論：Approach B + home優先累進填滿在真實座標上可行**——地理分區合理、端點固定路線正確；緊預算時**前面排滿自己周圍、超量只溢一天、起點恆為住宿、最後一天承接剩餘，明確不平分**（符合使用者指定）。

### ⚠ PoC 抓到的關鍵 landmine（正式實作必看）

第一版 `routeDay` 直接對 `[start, ...attractions, end]` 跑 `nearestNeighbor` 再 fixEnd 2-opt，結果**飯店錨點跑到路線中間**（例：Day1 排成「台場海濱→🏨台場→富士電視台→豐洲」，飯店沒在最後）。原因：NN 會把 end 節點重排到中間，fixEnd 2-opt 只會釘住「NN 排完後剛好在最後的節點」，不一定是 end 飯店。

**正解（PoC 已修正並驗證）：** 把 start/end 先「抽起來」釘在頭尾，NN 與 2-opt 只作用在中間景點（見 `accommodation-poc.ts` `routeDay`）。這也印證了 §3.2 的結論——**不要改既有 `twoOpt`，要新增 `twoOptFixedEnds`**（或受限位置版），否則全域 optimize 會被波及。

---

## 8. 給正式實作的建議

1. v1 採 **Approach B：就近 home-night + 累進填滿（fill-forward，不平分）**（本文件 §3）。
2. 新增 `twoOptFixedEnds`，不改既有 `twoOpt`（避免回歸全域 optimize）。
3. 資料模型用**可選欄位**擴充（§4），等 Lane A `lib/types.ts` 穩定後對齊命名再進主線。
4. `DAY_BUDGET_MIN` 與住宿夜序種子，依 PoC 結果定案；種子最終可由 Lane A 抵達點覆寫。
5. 全程維持決定性，以 TDD 補測試（分群、夜序、端點固定排序各一組）。

---

## 9. 交接給 Lane A（Handoff）

> **狀態：Lane B spike 完成，演算法已用 PoC 驗證。實作交回 Lane A**（因正式實作會動到 Lane A 擁有的核心檔 `lib/types.ts`、`app/actions/schedule.ts`、`app/actions/optimize.ts`）。本節即 Lane A 可直接接手的實作藍圖；Lane B 不改核心碼。

### Lane A 要做的事（建議任務拆解）

1. **`optimize.ts`：新增 `twoOptFixedEnds(route, matrix, {fixStart, fixEnd})`**
   不改既有 `twoOpt`（避免回歸全域 optimize）。受限位置版：可動區間 = `[fixStart?1:0 .. len-1-(fixEnd?1:0)]`。對應 PoC `routeDay` 內的 2-opt 段。

2. **新增住宿分群模組（例 `lib/accommodation/cluster.ts`）**
   移植 PoC 三函式：`inferNightOrder`（飯店夜序：景點重心最近者為種子 + NN/2-opt 串鏈）、`clusterFillForward`（home 優先 + 只溢一天 + 不平分）、`routeDay`（端點固定、起點恆為飯店）。皆為純函式、決定性。PoC：`docs/superpowers/spikes/accommodation-poc.ts`。

3. **`schedule.ts`：以住宿分群取代「按數量切天」**
   當輸入含 ≥1 個 `accommodation` 時，走新路徑：`inferNightOrder → clusterFillForward → 每天 routeDay → 交既有時段邏輯填時間`（餐別、`outsideHours`/`lateExit` 不變）。無住宿時維持現狀。

4. **`lib/types.ts`：可選欄位**（零破壞）
   `Place.nightIndex?: number`（住宿夜序）、`DayItinerary.startAnchor?/endAnchor?: Place`。命名由 Lane A 定。

5. **TDD**：分群（home 優先/只溢一天/不平分）、夜序、端點固定排序 各一組；沿用既有測試框架。

### Lane A 需拍板的開放決策（Lane B 已給預設）
- ~~`DAY_BUDGET_MIN` 預設值~~ → **已定案**：`DAY_BUDGET` ＝ 每日活動時間窗（結束−開始，#2 定義，預設 09:00–21:00）。**待決：活動時間窗是「全程一個」還是「每天可不同」**（見 §3.1）。
- 夜序種子：PoC 用「景點重心最近的飯店」；**最終建議由 Lane A 的 Day 1 抵達點覆寫**（抵達點最近的飯店＝夜1）。
- Day 1 起點錨、最後一天結束時間 → **本來就是 Lane A 範圍**，與本設計接點為 `startAnchor/endAnchor`。

### 交接邊界
- Lane B 交付：本設計文件 + 已驗證 PoC（`accommodation-poc.ts`）。
- Lane A 接手：上述 1–5 的核心碼實作 + 測試 + 進主線。

---

## 附：關聯
- 子專案 #1（需求 1）住宿類型標籤：`docs/superpowers/specs/2026-06-28-accommodation-type-tag-design.md`
- 需求 4 人潮資料 spike：`docs/superpowers/spikes/2026-06-28-crowd-data-findings.md`
- 既有 optimizer：`app/actions/optimize.ts`（`nearestNeighbor`/`twoOpt`）、`lib/haversine.ts`、`app/actions/schedule.ts`
