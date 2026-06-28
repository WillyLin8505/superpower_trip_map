# Findings：人潮時段資料來源（子專案 #9 / 需求 4）

> Lane B 決策文件。對應 brief：`2026-06-28-crowd-data-spike.md`。
> 研究日期：2026-06-28。分支：`lane/ai-research`。
> **本文件只給建議，未改動任何核心檔案**（`lib/types.ts`、`lib/utils/clientScheduler.ts`、`app/actions/schedule.ts`、`components/ItineraryCard.tsx`、`app/itinerary/ItineraryClient.tsx` 一律未碰）。

## TL;DR（先讀這段）

1. **Google 官方沒有人潮 API，而且確定不會有。** Places（新版 `places.googleapis.com/v1` 與舊版）、Routes、Distance Matrix、Places Aggregate、Maps JS 的 Place Details widget——全部查過，**沒有任何** `popularTimes` / `busyness` / `currentPopularity` 欄位，2024–2026 的 release notes 也沒有相關公告。**這條路徹底釘死，不要再追。**
2. **主來源推薦：`BestTime.app`**——自助註冊、純 HTTPS REST、提供「星期 × 小時」相對人潮（0–100%），是這個價位帶唯一真正為「單一地點某時段人潮」設計的 API。**唯一重大風險：台/日/韓實際 venue 命中率未經實測**，必須用免費額度對真實地點驗證後才能拍板。
3. **Fallback 推薦：決定性啟發式估計（deterministic heuristic）**——用 place type + 時段 + 評論數 + rating 算出 低/普通/多，**零外部相依、零成本、可快取、可單元測試**。只當「沒有真實資料時的退路」，且 UI 必須明確標示為「預估」。
4. **明確拒絕：**
   - `populartimes` 開源爬蟲——2021 後無人維護、違反 Google ToS、Google 已於 2025/12 對爬蟲提告、且要在 TS/Vercel 外掛 Python 服務。法律 + 可靠度 + 維運三重不划算。
   - Foursquare Premium / SafeGraph(Advan) / Placer.ai——美國為主、bulk/enterprise、需業務洽談、無便宜的單點查詢，**亞洲覆蓋不足**，不適合本專案。

---

## 比較表

| 選項 | 涵蓋率（台/日/韓） | 成本 | 整合難度（Next.js/TS/Vercel） | 可靠度 & ToS/法律 | 粒度 & 新鮮度 | 結論 |
|------|------------------|------|------------------------------|-------------------|---------------|------|
| **Google 官方 API** | — | — | — | — | — | ❌ **不存在**（確認過，無此路徑） |
| **BestTime.app** | 宣稱 150+ 國，台/日/韓都有城市目錄頁與真實 venue demo；**實際單點命中率未實測（最大風險）** | 免費測試額度（無需信用卡）；之後 metered：Basic ~$29/mo 起、Pro ~$99/mo 起（新建 forecast 較貴，查詢已建 venue 較便宜） | **低**：純 REST/JSON，server action 直接打；public/private 雙金鑰；**但需先 POST 建 forecast 才能查**（兩階段） | 無公開 SLA（非企業方案）；資料定位為「預測」非實況；隱私聲明為匿名彙總 | 星期(0–6) × 小時(0–23) 相對 0–100%；另有 live（Pro）；forecast 數週有效，可快取 | ✅ **主來源**（須先做覆蓋率驗證） |
| **populartimes（開源爬蟲）** | 寄生於 Google Maps 顯示的資料；大型景點有、長尾小店常常沒有 | 函式庫免費，但隱藏成本高：住宅代理(proxy)、獨立 Python 服務、維護人力 | **高**：Python-only，Vercel 跑不動，需另起 microservice + 自建快取 | **差**：2021 後停更；Google 反爬蟲持續加強、會 CAPTCHA/封 IP；**違反 Maps ToS §10.1(a)**；**Google 2025/12 起對爬蟲提告** | 7×24 相對 0–100 + 部分 live；非即時、相對值 | ❌ **拒絕**（法律 + 可靠度 + 維運） |
| **Foursquare Places** | POI 廣，但 busyness 訊號在亞洲薄弱且未驗證 | Places API 有開發者額度；但 busyness 欄位（`hours_popular`/`popularity`）在 **Premium 旗艦（contact-sales、flat-file）** | API 部分為 REST，可打；**但要的人潮欄位不在自助 API**，是 bulk 檔案 | 標準開發者 ToS；Premium 為授權資料、有再散布限制 | `hours_popular`（週時段直方圖）+ `popularity`（單一 0–1，非逐時）；~6 個月窗 | ❌ 想要的人潮資料被鎖在企業檔案層 |
| **SafeGraph / Advan（Dewey）** | **美國為主，亞洲幾乎沒有** | 自訂/企業，數百到數萬美金 | bulk 資料集，非即時單點 API，整合彆扭 | 重度資料授權條款 | 月/週訪問模式 + 時段分布，落後數週/月 | ❌ 不適用（亞洲覆蓋 + 模式不符） |
| **Placer.ai** | **美國為主，台/日/韓基本無覆蓋** | 企業限定，約 $5k–$50k/年，需業務 | 有 API，但須先簽約 | 企業授權，再散布限制 | 日/週/月趨勢，非逐時公開查詢 | ❌ 不適用（亞洲覆蓋 + 成本） |
| **AI / 啟發式估計** | 全球皆可（因為不依賴真實資料） | 決定性啟發式 **$0**；若用 LLM 每份行程約 $0.02（Haiku）/ $0.07（Sonnet） | **極低**：純函式，server/client 皆可；LLM 可選 | 無外部相依、無 ToS 風險；**風險是「自信地猜錯」** | 任意粒度，但只是方向性、非量化 | ✅ **Fallback only**（須標示為預估） |

---

## 逐項細節

### 1. Google Maps Platform — 官方人潮？→ 確定 NO
- **Places API（新版 + 舊版）**：完整 data fields 都查過，唯一與時間相關的是 `currentOpeningHours` / `regularOpeningHours` / `openingDate` / `timeZone`（舊版只有 `opening_hours`）。**沒有** `popularTimes` / `busyness` / `currentPopularity` / 等候時間欄位。
- **Routes / Distance Matrix**：只有「道路」即時車流，無「地點」人潮概念。
- **Places Aggregate API**：只回「數量 + place IDs」（地點密度），**不是**即時人潮。
- **Maps JS Place Details widget**：子元素涵蓋營業時間/評論/評分/照片等，**沒有** popular-times 元素；`place.fetchFields()` 只回文件化的 Places 欄位（同樣不含人潮）。所以連「先 render 再爬 DOM」都無資料可讀。
- **2024–2026 公告**：release notes 掃過（AI 摘要、transit、EV 充電、停車、地址描述、沿路搜尋…），**無**人潮/busyness 相關。
- 來源：developers.google.com Places data-fields / REST reference / legacy details / places-aggregate / release-notes / Maps JS place-details；support.google.com/business/answer/6263531（Google 自述人潮來自彙總的 Location History）。

### 2. BestTime.app —（主來源候選）
- **資料形狀**：`day_int` 0(Mon)–6(Sun)、`hour` 0–23、相對 `0–100%`（相對該地點自身尖峰），提供整週 / 指定日時 / 當前 / 尖峰等查詢；Pro 方案另有 live（每查 1 credit）。forecast「數週內有效」→ 適合 **快取 + 週期刷新**。
- **整合**：純 HTTPS REST，Next.js server action / route handler 直接打；**public/private 雙金鑰**（private 建 forecast、讀 live；public 唯讀已建 forecast）→ private key 放 Vercel env 即可。
- **重要摩擦點（兩階段模型）**：不能對任意地點即時查。要先 `POST /api/v1/forecasts`（用名稱+地址或 venue id）建立 forecast 拿到 `venue_id`，**之後**才能查週/日/時/now。對行程規劃 = 「每個地點先建一次 forecast → 之後查詢/快取」的兩段流程，且建 forecast 是較貴的 credit。
- **成本（2026，以官方 pricing 頁為準）**：免費測試帳號（無需信用卡）+ 一批免費 credits；之後 metered：Basic ~$29/mo 起（~$0.06/credit，無 live）、Pro ~$99/mo 起（~$0.009/credit 起、含 live、可 CDN 快取）；by-name 建 forecast = 2 credits、by-id = 1 credit。
  - ⚠ **價格不一致（待簽約時確認）**：另一條研究線看到「~$9/mo Basic、100 免費 credits、~450 credits/mo」的較低數字，可能是舊方案或不同頁面。**以註冊當下官方 pricing 頁為準。**
- **最大未知 = 亞洲覆蓋率**：官方有台灣(~13 城)/日本(~162 城)/韓國 的目錄頁、韓國有真實 venue demo，但這些是行銷頁；實際資料只在「該地點有足夠造訪量」時才有，**小店長尾很可能空**。**必須**用免費額度對「你真正會排進行程的台/日/韓地點樣本」實測命中率，才能拍板。
- 來源：besttime.app/subscription/pricing、documentation.besttime.app、besttime.app/app/{Taiwan,Japan,South-Korea}/。

### 3. populartimes 開源爬蟲 —（拒絕）
- 正典 repo `m-wrzr/populartimes` **最後 commit 為 2021/10**，未上 PyPI（要 vendor）；JS port `populartimesjs` 更不維護。
- **可靠度差且每況愈下**：打的是未文件化的 Maps 預覽端點 + regex/JSON 解析；Google 2024–2025 反爬蟲（JS 渲染、CAPTCHA、IP flag）讓簡單 HTTP 爬蟲失效，需真實瀏覽器 + 住宅代理。
- **ToS/法律明確不利**：issue #90 引用 Maps ToS §10.1(a) 禁止透過「未文件化介面」存取；**Google 2025/12 起對爬蟲方提告**（對 user-facing 商用產品是真實合規風險）。
- **整合成本高**：Python-only、Vercel 跑不動，要另起 Cloud Run/Fly/Railway 服務 + 自建快取；每次查詢仍要打 Google Places 解 place_id。
- 來源：github.com/m-wrzr/populartimes（含 commits、issues #90/#52/#34）、pypi LivePopularTimes、dataimpulse 2025 反爬蟲報導、abovethelaw 2025/12 Google 提告報導。

### 4. Foursquare / SafeGraph / Placer.ai —（拒絕）
- **Foursquare**：Places API 自助可拿 POI metadata，但真正的逐時 busyness（`hours_popular`、`popularity` 0–1）在 **Premium（Early Access、contact-sales、flat-file bulk）**，不是自助逐點 API。亞洲 busyness 訊號未驗證且偏薄。
- **SafeGraph→Advan（Dewey）**：bulk 資料集授權模式，**美國為主**，亞洲弱到無；非即時單點查詢。
- **Placer.ai**：企業分析平台 + API add-on，**美國為主、台/日/韓基本無覆蓋**，$5k–$50k/年、需業務。
- **小結**：這三家對「小型自助 Next.js + 亞洲逐點人潮」實際上都不可用。

### 5. AI / 啟發式估計 —（Fallback only）
- **建議：決定性啟發式為預設，LLM 僅選用於離線產生分類曲線（產一次、永久快取）**，不要逐請求打 LLM。
- 啟發式草案（輸出 `low|medium|high`）：
  1. **基礎熱度** by `user_ratings_total`：取對數，如 `popularity = clamp(log10(reviews+1)/4.5, 0..1)`。
  2. **分類時段曲線**：靜態 `place_type → 7×24 相對乘數` 查表（餐廳午/晚尖峰、夜店週五六夜、景點/公園週末白天、商場週末午後…）——可編輯常數，非魔法。
  3. **營業時間 gate**：該時段沒開 → 不輸出人潮（標 closed）。
  4. **合成**：`slot_score = popularity × 分類乘數[day][hour]`，再用固定門檻分桶；可用 rating 微調。
- **誠實的準確度天花板**：只能對「常見類別」抓到**方向性形狀**（市區拉麵店週五 19:00 比週二 15:00 忙），無法知道 venue 個別實況（冷門寶藏可能爆滿、名景點淡季可能空）；節慶/天氣/活動全看不到。`user_ratings_total` 是「歷年累積熱度」不是「此刻擁擠度」，是系統性偏差。
- **UX 必須誠實**：明確標「預估 / Estimated」、與 API 事實（營業時間、門票）視覺區隔；只用粗桶（較少/普通/較多），**不要**假精度百分比；hover 說明理由（「熱門地點 × 週末午後」）；低信心就 grey out。
- **成本**：啟發式 $0；若用 LLM，整份行程批次一次呼叫，Haiku ~ $0.02、Sonnet ~ $0.07（可忽略，但相對免費啟發式是純多花錢換低準度，故僅離線產曲線用）。
- **決定性/快取**：啟發式完全 deterministic、可依 `(place_id, day_bucket)` 快取、可單測；LLM 非決定性（同地點可能 Medium→High，看起來像壞掉），若用須把結果快取成穩定值。

---

## 整合草案（只建議，不改核心碼）

> 等 Lane A 的核心資料模型穩定後，需求 4 的正式實作以本節為基礎再排進主線。以下為「建議」，待 Lane A `lib/types.ts` 拍板後再對齊命名。

### 建議資料模型（新增、非破壞性）
在 `Place`（或對應 enriched place 型別）上新增**可選**欄位，避免破壞既有 optimizer/scheduler：

```ts
// 建議：lib/types.ts（Lane A 擁有，這裡僅提案，勿由 Lane B 改）
export type CrowdLevel = 'low' | 'medium' | 'high';
export type CrowdSource = 'besttime' | 'heuristic'; // 來源透明化，UI 據此標示

export interface CrowdForecast {
  source: CrowdSource;
  /** 7 天 × 24 小時，0–100 相對值；無資料的格子為 null */
  weekly: (number | null)[][];      // weekly[day0Mon..6Sun][hour0..23]
  fetchedAt: string;                // ISO，配合 TTL 快取
  venueId?: string;                 // BestTime venue_id，便於後續低成本查詢
}

// Place 上新增（皆 optional，零破壞）：
//   crowd?: CrowdForecast;
```

### 建議呼叫流程（BestTime 為主、heuristic 為退路）
1. 解析地點時（已有 Google place）→ 檢查快取 `crowd_forecast`（建議 Supabase 表，key = `place_id`，TTL 例如 14–30 天）。
2. 快取 miss → server action 呼叫 BestTime：
   - `POST /api/v1/forecasts`（private key，by venue id 或 name+address）建 forecast → 拿 `venue_id` + 週資料 → 寫快取。
   - 失敗或 BestTime 回「資料不足」→ **fallback 決定性啟發式**，`source: 'heuristic'`。
3. UI 依 `source` 標示：`besttime` 顯示為資料、`heuristic` 顯示為「預估」。
4. 需求 4 的「提醒」：在 scheduler 排定的到訪時段，讀 `weekly[day][hour]`，超過門檻（如 ≥70）就在該 stop 掛「此時段可能人多」提示。**此邏輯屬 Lane A 的 scheduler/UI，不在本 spike 實作。**

### 快取策略
- BestTime forecast 數週有效 → 14–30 天 TTL 完全足夠，且大幅省 credits（建 forecast 是貴的部分，查詢/快取是便宜的部分）。
- 啟發式為 deterministic → 可不快取或長快取；無外部成本。
- 建議把 `venue_id` 一併存，之後要查 live（Pro）或刷新只需 1 credit。

---

## PoC

> 受限於需要 API key，**無法在 spike 內直接打到 BestTime live 端點**（註冊免費 key 屬使用者動作）。因此提供**可直接執行的獨立程式** `docs/superpowers/spikes/crowd-poc.ts`，未接進主程式：
>
> - **Part A — BestTime PoC**：填入免費 `BESTTIME_PRIVATE_KEY` 後，對「單一地點」跑一次 `POST /forecasts`，把原始回應印出（即 brief 要求的佐證）。
> - **Part B — 決定性啟發式 PoC**：零相依，直接 `npx tsx crowd-poc.ts` 即可跑，對範例地點輸出整週 低/普通/多，示範 fallback 可行性。
>
> **下一步（需使用者協助）**：若您願意去 besttime.app 申請免費測試 key，我可以用它對 3–5 個真實台/日/韓地點實跑 Part A，把原始回應與**覆蓋率命中結果**補進本文件——這正是拍板 BestTime 前唯一還缺的證據。

### Part B 實跑結果（佐證，已實際執行）

對三個範例地點跑啟發式，輸出方向性正確（熱門餐廳午晚尖峰=多、午後=少；冷門小店整體偏普通；博物館午間=多、19:00=closed）：

```
鼎泰豐 信義店(熱門餐廳) (reviews=42000, rating=4.4)
  Mon  12:00=high   15:00=low   19:00=high
  ...（每天同形狀）

某巷弄小店(冷門餐廳) (reviews=90, rating=4.6)
  Mon  12:00=medium 15:00=low   19:00=medium
  ...

國立故宮博物院(景點) (reviews=65000, rating=4.5)
  Mon  12:00=high   15:00=high  19:00=closed
  ...
```

驗證了 fallback 在零相依、零成本下可產生合理的方向性提示。（注意：picked 小時未顯出週末差異是因午間尖峰被 clamp 到 high；曲線本身含週末乘數，於其他時段可見。）

---

## 給主線的最終建議

1. **採用 BestTime.app 為主來源**，但把「對真實台/日/韓地點樣本實測覆蓋率」列為**正式實作前的 gate**（用免費額度，約半天）。覆蓋率足夠 → 正式接；不足 → 降級為「有資料才顯示，其餘走啟發式」。
2. **決定性啟發式估計為 fallback**，永遠標示「預估」，只做方向性提醒。
3. **正式放棄** Google 官方路徑、開源爬蟲、Foursquare/SafeGraph/Placer。
4. 資料模型用**可選欄位**擴充，等 Lane A `lib/types.ts` 穩定後對齊命名再進主線。

---

## 附：來源清單（彙整）
- Google 官方無人潮 API：developers.google.com Places (new/legacy) data-fields、REST reference、places-aggregate/overview、release-notes、Maps JS place-details；support.google.com/business/answer/6263531。
- BestTime：besttime.app/subscription/pricing、documentation.besttime.app、besttime.app/app/{Taiwan,Japan,South-Korea}/。
- populartimes：github.com/m-wrzr/populartimes（commits 2021-10、issues #90/#52/#34）、pypi LivePopularTimes、dataimpulse 2025 反爬蟲、abovethelaw 2025-12 Google 提告。
- 商用 foot-traffic：foursquare.com/products/places-api、docs.foursquare.com places-pro-and-premium、deweydata.io advan-patterns、placer.ai/products/api、growthfactor.ai foot-traffic-provider-comparison。
- 成本（LLM fallback）：Claude Haiku 4.5 $1/$5 per M、Sonnet 4.6 $3/$15 per M。
