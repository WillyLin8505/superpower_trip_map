# 人潮資料層 Design — 子專案 #9 / 需求 4（實作層）

**日期：** 2026-06-28
**狀態：** 設計已核准 → 待 writing-plans
**Lane：** B（`lane/ai-research`）
**前置決策：** [crowd-data findings](../spikes/2026-06-28-crowd-data-findings.md)（BestTime 主來源 + 啟發式 fallback）

> 這是 Lane B **可獨立於 Lane A** 完成的工作：**全部新增檔案**，對外只給一支乾淨介面 `getCrowdForecast(place) → CrowdForecast`。**不修改 Lane A 的 6 個核心檔**（`lib/types.ts`、`lib/utils/clientScheduler.ts`、`app/actions/schedule.ts`、`app/actions/optimize.ts`、`components/ItineraryCard.tsx`、`app/itinerary/ItineraryClient.tsx`）；僅 `import type { Place }`（唯讀引用，不算修改）。

---

## 1. 目標與範圍

提供一個資料層，回答「某地點在某星期某小時的人潮程度」。這是 **需求 4（時段人潮提醒）** 與 **避峰智慧排序**（已交 Lane A）兩者的共同地基。

**範圍（Lane B）：** 資料層本身——BestTime 串接、啟發式估計、快取、編排，對外一支介面。
**不在範圍（Lane A）：** 需求 4 的 UI badge、避峰排序的排程改造——它們**呼叫** `getCrowdForecast`，Lane B 止於介面。

---

## 2. 對外介面

新檔 `lib/crowd/types.ts`（`import type { Place } from '@/lib/types'` 唯讀）：

```ts
export type CrowdLevel = 'low' | 'medium' | 'high'
export type CrowdSource = 'besttime' | 'heuristic'

export interface CrowdForecast {
  source: CrowdSource              // Lane A 據此標示「即時資料 / 預估」
  weekly: (number | null)[][]      // weekly[day][hour]；day 0=週一..6=週日；hour 0..23
                                   // 相對 0–100（相對該地點自身尖峰）；無資料格=null
  fetchedAt: string                // ISO 時間，配合 TTL
  venueId?: string                 // BestTime venue_id（後續低成本刷新/查 live 用）
}

// 分桶便利函式（呼叫端不必直接讀 weekly 原始數字）
export function levelAt(f: CrowdForecast, day: number, hour: number): CrowdLevel | null
```

對外唯一進入點（server action）：
```ts
// app/actions/crowd.ts  ('use server')
export async function getCrowdForecast(place: Place): Promise<CrowdForecast>
```

**分桶門檻（`levelAt`，可調）：** `null`→null；`< 40`→low；`40–69`→medium；`≥ 70`→high。

---

## 3. 模組結構（全部新檔）

```
lib/crowd/
  types.ts       // CrowdForecast / CrowdLevel / CrowdSource / levelAt()
  heuristic.ts   // estimateCrowd(place) → CrowdForecast(source:'heuristic')；純函式、零相依
  besttime.ts    // fetchBestTimeForecast(place) → CrowdForecast | null；HTTP client
  cache.ts       // CrowdCache 介面 + InMemoryCache 實作（pluggable）
  index.ts       // getCrowdForecast：編排 cache → besttime → heuristic
app/actions/crowd.ts   // 'use server' 對外包一層
__tests__/crowd-heuristic.test.ts
__tests__/crowd-besttime.test.ts
__tests__/crowd-index.test.ts
__tests__/crowd-cache.test.ts
```

每個單元職責單一、可獨立測試：
- `heuristic.ts`：給 place → 估一週人潮（純函式，零外部相依）。
- `besttime.ts`：給 place → 呼叫 BestTime、解析成 `CrowdForecast`，失敗/無資料回 `null`。
- `cache.ts`：`CrowdCache { get(key); set(key,val,ttl); }` 介面 + 記憶體實作；之後可換 Vercel KV/Supabase 而不動呼叫端。
- `index.ts`：編排與 fallback 策略（Approach A）。

---

## 4. 資料流（Approach A：BestTime 優先、啟發式 fallback）

```
getCrowdForecast(place):
  key = place.placeId (或 name+address 雜湊)
  1. cache 命中且未過期 → 直接回
  2. 若有 BESTTIME_PRIVATE_KEY：
       f = await fetchBestTimeForecast(place)   // 失敗/無資料回 null
       if f: cache.set(key, f, TTL_BESTTIME); return f
  3. fallback: f = estimateCrowd(place)         // 啟發式，source:'heuristic'
     cache.set(key, f, TTL_HEURISTIC); return f
```

- **永遠回得出 `CrowdForecast`**（最差是啟發式），不丟例外給呼叫端。
- TTL：`TTL_BESTTIME = 14 天`（forecast 數週有效）；`TTL_HEURISTIC` 較短或現算（決定性，便宜）。

### BestTime 串接細節（`besttime.ts`）
- `POST https://besttime.app/api/v1/forecasts`，帶 `api_key_private`、`venue_name`、`venue_address`（取自 `place.name`/`place.address`）。回應含整週分析與 `venue_id`。
- 解析回應的「星期×小時」→ `weekly[0=週一..6=週日][0..23]`（注意 BestTime 的「店家日」約 6am 起算的細節，於實作對映時處理）。
- `status !== 'OK'` 或無 analysis → 回 `null`（交給 index 退啟發式）。

---

## 5. 啟發式（`heuristic.ts`，受現有欄位限制的誠實版）

`Place` 目前**沒有 review 數（`user_ratings_total`）**，故啟發式僅用 **`type`（我們的 4 分類）+ `rating` + `openingHours`**：
- **分類時段曲線**（靜態常數、可編輯）：餐廳午(11–13)/晚(17–20)尖峰、甜點下午、景點週末白天較高、住宿不評（`weekly` 回全 `null`）。
- **rating 輕度調整**（如 4.5 以上微升），無 rating 則中性。
- **營業時間 gate**：該時段未營業 → 該格 `null`。
- 輸出 `weekly` 0–100 + `source:'heuristic'`，**決定性**（同輸入同輸出，可單元測試）。

**誠實限制：** 沒有 review 數，準度僅「方向性」。**未來若 Lane A 在 `Place` 加入 `user_ratings_total`，啟發式可顯著升級**（base popularity 用評論數對數）——記為 future enhancement，本版不做（避免動核心檔）。

---

## 6. 錯誤處理 / 安全

- `BESTTIME_PRIVATE_KEY` 僅存於環境變數、**只在 server-side 讀取**（`app/actions/crowd.ts` 為 `'use server'`，`besttime.ts` 讀 `process.env`）。**絕不出現在前端 bundle**。
- 失敗策略：無 key／HTTP 錯誤／逾時／該地點無資料 → 一律**安靜退啟發式**，不向呼叫端丟例外。
- 逾時保護：BestTime fetch 設合理 timeout（如 5s），逾時即 fallback。

---

## 7. 測試（TDD）

| 測試檔 | 重點 |
|--------|------|
| `crowd-heuristic.test.ts` | 決定性；各分類時段形狀（餐廳午晚峰、景點週末）；非營業時段→null；`levelAt` 分桶門檻 |
| `crowd-besttime.test.ts` | **mock fetch**：weekly 解析正確、day/hour 對映、`status!=OK`→null、key 未設→不呼叫 |
| `crowd-index.test.ts` | 編排：cache 命中；besttime 成功(mock)；無 key/無資料→退啟發式；`source` 標記正確 |
| `crowd-cache.test.ts` | InMemoryCache set/get/TTL 過期 |

**key 相依邊界：** 只有「BestTime 真實覆蓋率驗證」（對真實台/日/韓地點實打）需要免費 key；上述程式碼與 mock 測試**不需 key 即可全部完成**。拿到 key 後再補一支真實整合驗證並更新 findings。

---

## 8. 給 Lane A 的串接點（之後消費）

- 需求 4 badge：在 `ItineraryCard` 對該停靠點呼叫 `getCrowdForecast(place)` 後 `levelAt(f, day, hour)` 顯示「較多/普通/較少」，並依 `source` 標「預估」。
- 避峰排序（[handoff](../spikes/2026-06-28-smart-sort-handoff.md)）：排程時比較各候選時段的 `weekly` 值挑人少時段。
- 兩者皆只依賴 `getCrowdForecast` + `levelAt`，不需知道資料來源。

---

## 9. 環境變數

```
BESTTIME_PRIVATE_KEY=...   # server-only；未設定時資料層自動全走啟發式
```

---

## 附：關聯
- 需求 4 決策：`docs/superpowers/spikes/2026-06-28-crowd-data-findings.md`
- 避峰排序交接：`docs/superpowers/spikes/2026-06-28-smart-sort-handoff.md`
- PoC（啟發式雛形）：`docs/superpowers/spikes/crowd-poc.ts`
