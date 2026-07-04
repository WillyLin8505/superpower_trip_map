# Per-place 建議停留時間 — 未來取得來源(待辦紀錄)

**狀態:** 記錄待辦(2026-07-04)。使用者要求先記下「如何抓取真實的每點建議停留時間」,未來再實作。

## 現在的決策(本次實作)
先用**固定 per-type 值**當建議停留時間:

| 類型 | 建議停留 |
|---|---|
| 景點 attraction | 120 分 |
| 餐廳 restaurant | 90 分 |
| 甜點 dessert | 60 分 |
| 住宿 accommodation | **無建議停留(不提醒)** |

卡片提醒:`durationMin < 建議` →「少於建議」(已存在);`durationMin > 建議` →「超過建議」(本次新增)。住宿兩者都不套用。

## 未來目標
改成**每個地點真實的建議停留時間**(即 Google 地圖上顯示的「一般人會待 X 小時」)。

## 硬限制(沿用 #9 crowd-data spike 結論,見 `2026-06-28-crowd-data-findings.md`)
- **Google 官方 API 沒有,且確定不會有。** Places(新版 `places.googleapis.com/v1` + 舊版)、Routes、Distance Matrix、Places Aggregate、Maps JS Place Details —— 全查過,**沒有** typical visit duration / dwell time 欄位。它與「熱門時段」同屬彙總自 Location History 的資料,只顯示在地圖 UI,不對外開放。
- **populartimes 開源爬蟲:判拒。** 2021 後停更、違反 Maps ToS §10.1(a)、Google 2025/12 起對爬蟲提告、需在 Vercel 外掛 Python 服務。法律+可靠度+維運三重不划算。

## 未來候選來源(需 spike 驗證,重點是亞洲命中率)
- **BestTime.app**(#9 選定的人潮來源):主打「星期×小時」foot-traffic。**需查其 API 是否另含 average dwell time / visit duration 欄位** —— #9 當時只驗人潮、未驗停留時長。若有,是最順的路(同一個供應商)。
- **Foursquare Places Premium**:`hours_popular` 是週時段人潮直方圖、非停留時長;dwell 類資料多鎖在企業 flat-file 授權層。
- 其他 location-intelligence 供應商(需另查)。

## 未來實作路徑(找到來源後)
- `ScheduledPlace` / `Place` 新增 `suggestedDurationMin` 欄位(此命名 spec 早在 `2026-06-28-accommodation-scheduling-design.md` §3.3 就預留)。
- 抓取時填入,取代固定 per-type 值;卡片提醒邏輯不變、只換資料來源。

## 現況實作位置
- 固定建議值:`lib/placeType.ts`。
- 提醒:`components/ItineraryCard.tsx`(少於/超過建議);timeline 視圖 `components/CardContent.tsx` 若也要顯示需另補。
