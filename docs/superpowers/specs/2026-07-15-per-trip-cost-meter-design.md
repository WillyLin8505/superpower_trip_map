# 每個行程的估算花費徽章(點數/金額) Design Spec

**日期：** 2026-07-15
**Lane：** Manager / TASK-024
**產品發現：** 使用者要「用點數/金額方式即時看到這個行程花了多少 Google API 錢」。AUQ 定案:**只算 Google Maps**、**顯示估算金額**、**每個 trip 一個**、顯示在行程頁旁。

## 1. 背景 —— 大部分後端已存在(先讀)

成本追蹤基礎(commit `278957a` 的成本任務)**已建好**,但目前未接成 per-trip 顯示:

- `supabase/migrations/0010_cost_control_foundation.sql` 已建 **`api_usage_events`** 表:`provider`、`endpoint`、`sku_hint`、`units`、`cache_hit`、**`estimated_cost_usd numeric(12,6)`**、**`trip_id uuid references trips`**、`user_id`、`created_at`,並有 **`(trip_id, created_at desc)` 索引**。
- `lib/apiUsageEvents.ts`:`estimateApiUsageCostUsd(skuHint, units)`(Google SKU 每千次單價表)、`recordApiUsageEvent`、**`trackedApiFetch`**(包住每個 Google fetch,自動記一筆事件含估算成本)。
- 所有 Google 呼叫點(`app/actions/places.ts`、`app/actions/directions.ts`、`app/api/photo/route.ts`、`app/api/place-photos/route.ts`)已改用 `trackedApiFetch`。

**缺口(本案要補的):**
1. 呼叫點**沒有把 `tripId` 傳進 `trackedApiFetch`** → 事件 `trip_id` 全是 null → 無法 per-trip 彙總。
2. **沒有彙總查詢**(sum per trip)。
3. **沒有 UI 徽章**。
4. `0010` 需已套用到 live Supabase。

## 2. 目標

在行程頁旁顯示一個小徽章:「本行程估算花費 ≈ US$X.XX」,隨著這個 trip 觸發的 Google 呼叫累加。**估算值**,非真實帳單。

## 3. 產品決策（定案）

- **DEC-701 只算 Google：** 只彙總 `provider = 'google'` 的事件(不含 Anthropic)。
- **DEC-702 每個 trip：** 彙總 `sum(estimated_cost_usd) where trip_id = X`。
- **DEC-703 顯示金額：** 主顯示 **US$**(Google 計費幣別);可選附 NT$(固定匯率 env `NEXT_PUBLIC_USD_TWD_RATE`,預設不顯示或 32)。
- **DEC-704 歸屬 trip：** 在有 trip 情境的 Google 呼叫點把 `tripId` 傳進 `trackedApiFetch` 的 `usage`;無 trip 情境(綁定前搜尋、無 tripId 的呼叫)記 `trip_id=null`,不計入任何 trip。
- **DEC-705 刷新時機：** 行程頁載入時查一次;會產生花費的動作(推薦、smart arrange、重算交通)完成後重新查。不做即時 websocket。
- **DEC-706 估算標註：** 徽章明確標「估算」;`cache_hit` 事件成本 0(已由 `trackedApiFetch` 記錄);單價為估計值(SKU 表)。

## 4. 範圍

- **不新增 migration**(`api_usage_events` 已在 `0010`);確認 `0010` 已套用 live。
- **歸屬 tripId(核心):** 在下列 server action 加上 `tripId` 參數並往下傳到 `trackedApiFetch` 的 `usage.tripId`:
  - `app/actions/places.ts`(`searchPlace`/`getPlaceDetails`/`nearbySearch`)
  - `app/actions/directions.ts`(`buildDistanceMatrix`)
  - 其呼叫者 `app/actions/legs.ts`、`app/actions/arrange.ts`、`app/actions/plan.ts`、`app/actions/recommend.ts` 需把當前 `tripId` 一路傳入。
  - 照片路由 `app/api/photo/route.ts`、`app/api/place-photos/route.ts`:若 request 帶得到 tripId 就記,否則 null。
- **彙總查詢:** `lib/apiUsageEvents.ts`(或新 `app/actions/apiUsage.ts`)加 `getTripEstimatedCostUsd(tripId): Promise<number>` — admin client、`sum(estimated_cost_usd)` where `trip_id` 且 `provider='google'`。
- **UI:** 新 `components/TripCostBadge.tsx` — 顯示「估算花費 ≈ US$X.XX」;接進 `components/ItineraryDay.tsx` / `app/itinerary/ItineraryClient.tsx`,放在行程欄旁(AI 摘要區或頁籤面板頂)。
- **不改:** 成本估算單價表、`trackedApiFetch` 行為、既有快取。

## 5. 資料 / 查詢

```ts
// 彙總（admin client；provider 過濾）
select coalesce(sum(estimated_cost_usd), 0) as usd
from api_usage_events
where trip_id = $1 and provider = 'google'
```

- 用既有 `(trip_id, created_at desc)` 索引;資料量大時可加 `provider` 到索引(選配)。
- 回傳 USD;UI 端 `toFixed(2)`,可乘 `NEXT_PUBLIC_USD_TWD_RATE` 顯示 NT$。

## 6. UI

- 徽章:`估算花費 ≈ US$0.42`(clay token,小字,`title`/aria 說明「估算,非真實帳單」)。
- 位置:行程頁,與行程欄同區(AI 摘要下方或側欄頂),不干擾拖曳。
- 空/零:`US$0.00`。
- 刷新:頁面載入 + 花費動作(推薦/arrange/leg 重算)後重查。

## 7. 錯誤 / 邊界

- `0010` 未套用 / 表不存在:`recordApiUsageEvent` 已 graceful no-op;彙總查詢遇缺表回 0 + 不 crash。
- `estimated_cost_usd` 為 null(未知 SKU):以 0 計入 sum(`coalesce`)。
- `trip_id=null` 的事件:不屬於任何 trip,不顯示。
- RLS:`api_usage_events` 已啟用 RLS;彙總走 admin client(server action),不直接暴露 raw 事件給前端。

## 8. 測試（TDD）

1. **`getTripEstimatedCostUsd`**:只加總該 tripId 且 `provider='google'`;排除他 trip、`trip_id=null`、非 google;null 成本以 0 計。
2. **tripId 歸屬**:呼叫帶 tripId 的 `searchPlace`/`buildDistanceMatrix` → 記錄的事件 `trip_id` 正確(mock `recordApiUsageEvent` 斷言 usage.tripId)。
3. **快取命中**:`cache_hit` 事件成本 0,不灌水總額。
4. **UI 徽章**:給定 cost → 顯示 `US$X.XX` + 估算標註;0 顯示 `US$0.00`。
5. **回歸**:既有 `trackedApiFetch` / places / directions 行為與測試不變。

## 9. Global Constraints

- TypeScript strict,無 production `any`。
- 遵循 `DESIGN.md`。
- 既有全測試保持綠;`next build` 成功。
- 依 `CLAUDE.md`:實作後跑 `codex` review。

## 10. Self-Review

- **Placeholder scan：** 無 TBD。
- **決策保留：** DEC-701…DEC-706 於 §3 定案並貫穿 §4–§8。
- **重用既有：** 不重造輪子 —— `api_usage_events`(0010)+ `trackedApiFetch` + `estimateApiUsageCostUsd` 已存在;本案只補「tripId 歸屬 + 彙總 + 徽章」。
- **範圍：** 中型。最大工項與風險 = **把 tripId 一路穿到 Google 呼叫點**(跨 places/directions/legs/arrange/plan/recommend);需逐一確認呼叫鏈有 trip 情境。
- **依賴：** `0010` 已套用 live;與 TASK-022(ItineraryDay 版面)、TASK-023(legs/scheduler)在檔案上有重疊 → 標入 `## Conflicts`。
- **非目標：** 真實帳單對帳、Anthropic 成本、跨 trip/全站儀表、對使用者收費。
