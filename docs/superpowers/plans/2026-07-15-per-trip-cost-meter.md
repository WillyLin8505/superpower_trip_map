# 每個行程的估算花費徽章 — Implementation Plan

**Spec：** `docs/superpowers/specs/2026-07-15-per-trip-cost-meter-design.md`
**日期：** 2026-07-15

## 前置

- 確認 `supabase/migrations/0010_cost_control_foundation.sql` 已套用到 live Supabase(`api_usage_events` 表在)。
- 讀 `lib/apiUsageEvents.ts` 完整(`trackedApiFetch` / `estimateApiUsageCostUsd`)與各 Google 呼叫點,確認呼叫鏈的 trip 情境。
- 認領前 `$multi-claim-task` 確認與 TASK-022/023 的鎖無重疊(`ItineraryDay.tsx`、`legs.ts`)。

## 實作步驟（TDD：先寫測試再實作）

### 步驟 1 — 彙總查詢（最獨立,先做）
- 測試 `__tests__/trip-cost.test.ts`(mock Supabase admin):`getTripEstimatedCostUsd(tripId)` 只加總該 trip 且 `provider='google'`;排除他 trip / `trip_id=null` / 非 google;null 成本以 0 計;缺表回 0。
- 實作 `getTripEstimatedCostUsd(tripId)` 於 `lib/apiUsageEvents.ts`(或新 `app/actions/apiUsage.ts`):admin client、`coalesce(sum(estimated_cost_usd),0)`。

### 步驟 2 — tripId 歸屬（核心 + 風險）
- 測試 `__tests__/api-usage-trip-attribution.test.ts`:mock `recordApiUsageEvent`,呼叫帶 tripId 的 `searchPlace`/`buildDistanceMatrix` → 斷言事件 `usage.tripId` 正確傳入;快取命中成本 0。
- 實作:`app/actions/places.ts`、`directions.ts` 的相關函式加**選用** `tripId?: string` 參數,傳進 `trackedApiFetch` 的 `usage.tripId`;呼叫者 `legs.ts`/`arrange.ts`/`plan.ts`/`recommend.ts` 把當前 tripId 往下傳。無 trip 情境維持 `undefined`(記 null)。
- 照片路由:若 query/header 帶得到 tripId 就記,否則 null(小改,可選)。

### 步驟 3 — UI 徽章
- 測試 `__tests__/trip-cost-badge.test.tsx`:給 cost → 顯示 `US$X.XX` + 估算標註;0 → `US$0.00`。
- 實作 `components/TripCostBadge.tsx`;接進 `components/ItineraryDay.tsx` / `app/itinerary/ItineraryClient.tsx`,放行程欄旁。載入時取 `getTripEstimatedCostUsd`;會花費的動作(推薦/arrange/leg 重算)完成後重取(DEC-705)。

### 步驟 4 — 回歸 + 文件
- 既有 `trackedApiFetch` / places / directions 測試全綠。
- 徽章文案標「估算」。

## 驗證

- `npx jest __tests__/trip-cost.test.ts __tests__/api-usage-trip-attribution.test.ts __tests__/trip-cost-badge.test.ts` → 全綠。
- `npm test` 全套保持綠。
- `npx tsc --noEmit`;`next build` 成功。
- 手動:開一個 trip → 搜地點/推薦/重算交通 → 徽章數字往上跳;重整後仍在(DB 持久);他 trip 各自獨立;`cache_hit` 不灌水。
- **依 CLAUDE.md:** 跑 `codex` review。

## 風險 / 備註

- **最大風險 = tripId 穿線**:Google 呼叫散在多個 server action,部分呼叫鏈(綁定前搜尋)沒有 trip 情境 → 記 null 是正確行為,不要硬塞。逐一確認每條鏈。
- 估算 ≠ 真實帳單(單價表 + 快取近似);徽章務必標「估算」避免誤解。
- 與 TASK-022(`ItineraryDay.tsx`)、TASK-023(`legs.ts`/scheduler)共檔 → 排程上避免並行(見 `## Conflicts`)。
- 未來可延伸:全站/每使用者彙總、Anthropic 成本、真實帳單對帳 —— 皆為本案非目標。
