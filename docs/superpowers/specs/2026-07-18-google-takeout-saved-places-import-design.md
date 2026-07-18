# 從 Google Takeout 匯入標籤到「我的收藏庫」— 設計文件

- **日期:** 2026-07-18
- **狀態:** 待實作(brainstorming 完成,已定案)
- **範圍:** 單一垂直功能(個人收藏庫 + Takeout 匯入 + 帶進行程)

## 問題 / 目標

使用者在 Google Maps 累積了大量已儲存地點與清單(「台南美食」「想去的咖啡廳」…),
希望把這些「標籤」帶進本 app 規劃行程,而不用一個一個重新搜尋。

## 可行性前提(重要,決定了整個設計形狀)

**「用 Google 登入 → 自動讀取我的 Google Maps 標籤」在技術上做不到。** Google Maps
Platform 沒有任何 OAuth scope 能讓第三方 app 讀取使用者個人的已儲存地點 / 星號 /
標籤 / 清單。Places API 只查公開地點資料;Map Management API 的 OAuth 是管自己
Google Cloud 專案的地圖樣式。因此唯一可靠的官方路徑是 **Google Takeout 檔案匯出 →
上傳**。此結論經 2026-07 查證 Google Maps Platform 文件。

登入仍然需要,但角色不同:不是用來讀 Maps 資料,而是因為收藏庫是個人資料、要
綁 `auth.users`,所以沿用現有的 Google / LINE 登入(Supabase Auth)。

## 定案的決策

1. **匯入機制:** Google Takeout 檔案上傳(GeoJSON 星號地點 + 每個清單一個 CSV)。
2. **存放位置:** 跨行程的個人收藏(新資料表 `saved_places`,綁 `owner_id`),非單趟候選池。
3. **分組(資料層):** 保留 Google Maps 原本的清單來源(存 `list_name`,顯示在卡片來源標籤);
   頁籤導覽改用**類別**子頁籤(見決策 7),非按清單逐一列表。
4. **成本策略(兩段式):** 匯入時用**便宜的 Essentials 等級**解析,拿
   `place_id + 類型 + 座標 + 名稱`(SKU `place_details_essentials` ≈ 5/1000,只算你勾選的、
   有快取);**昂貴的 Pro 完整資料(照片/評分/營業時間/簡介)延後**到地點真正被加進某趟行程
   時才抓(`getPlaceDetails`,`place_details_pro` ≈ 17/1000)。類型是分類別子頁籤所必需,
   故必須在匯入時取得。
5. **UI 呈現:** 做成 `components/SidePanel.tsx` 的**第四個頁籤**(推薦行程 / LINE 討論 /
   備用行程 之外),非獨立頁面。
6. **加入行為:** 跟推薦卡片一樣可**直接排進當天行程**(SidePanel 是 per-day、帶 `dateIso`);
   加入當下才 `getPlaceDetails` 補全 Pro 資料 + 付費。
7. **收藏頁籤 = 推薦引擎(來源換成收藏):** 依當天中心點(`resolveDayCenter`:中心點→當天行程
   推算→前一天→整趟)把收藏排序、分「甜點/景點/餐廳」子頁籤、每類最多 5 張,重用
   `DayRecommendations` / `RecommendationCard`;卡片動作(加入/移到備用/刪除)與推薦一模一樣,
   刪除=這次不看(不動收藏庫)。

## 非目標(YAGNI)

- 不做 OAuth 自動同步 / 背景輪詢(技術上不可行,見上)。
- 不在 app 內編輯 / 新建 / 重新命名 Google Maps 清單。
- 不做收藏庫的「重新匯出」或與行程成員共享收藏庫(共享發生在 `trip_candidates` 層)。
- 匯入時不抓 Pro 完整資料(照片/評分/營業時間/簡介);只取便宜的類型+座標(見成本策略)。
- 不跨清單去重:同一地點出現在多個清單是正常的,分別保留(對齊 Google 行為)。

## 資料模型

新 migration `supabase/migrations/0011_saved_places.sql`,RLS 仿照
`0009_user_place_index.sql`(只能存取 `auth.uid() = owner_id` 的列):

```sql
create table if not exists public.saved_places (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  list_name  text not null,               -- 來源清單名;星號地點用 '已加星號'
  source     text not null check (source in ('takeout_starred','takeout_list','takeout_labeled')),
  place_id   text not null,               -- 解析後的 Google Place ID(免費 Find Place 取得)
  place      jsonb not null,              -- 中量 stub(類型/座標);Pro 資料延後、加入行程時回填
  note       text,                        -- Takeout CSV 的備註欄(可空)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, list_name, place_id)  -- 同一清單內去重
);
create index if not exists saved_places_owner_idx on public.saved_places(owner_id);
-- RLS: select/insert/update/delete 皆 using/with check (auth.uid() = owner_id),四條 policy。
```

`place` jsonb 存**中量 stub**(匯入時 Essentials 解析已取得):`{ id, placeId, name, lat,
lng, address, type(真實類型), openingHours:null, rating:null, photoUrl:null, photoUrls:[],
description:null, localizedName? }`。缺的是 Pro 專屬欄位(照片/評分/營業時間/簡介);地點被
加進行程時以 `getPlaceDetails(place_id)` 補全,並可選擇性回填這一列的 `place`。真實 `type`
讓收藏頁籤能分「甜點/景點/餐廳」桶。

清單分組用 `list_name` 欄位即可,不另開 lists 表(YAGNI;日後要清單重新命名再升級成
獨立表 + 外鍵)。

## 匯入流程

入口在收藏頁籤內的「匯入 Google Maps 標籤」按鈕(需登入;匿名者顯示登入引導)。
按鈕開匯入流程(inline 區塊或 modal):

1. **上傳:** 接受一或多個 Takeout 檔案(GeoJSON 星號地點、各清單 CSV),依內容自動
   判別格式。
2. **解析(純函式,好測):** 每筆抽出 `{ listName, source, title, note, lat?, lng? }`。
   - GeoJSON(`Saved Places.json`):`geometry.coordinates=[lng,lat]`、
     `properties.Title` / `properties.Location.Business Name`、`properties.Google Maps URL`。
   - CSV(每個清單一檔,如 `Want to go.csv`):欄位 `Title, Note, URL`,`listName` = 檔名
     去副檔名。CSV 通常無座標。
3. **Essentials 解析(新 helper,不走 `searchPlace` 整包):** 新增
   `resolvePlaceEssentials(title, { lat, lng }?)`:先查 `place_id_cache`(免費)→
   `findplacefromtext` 拿 `place_id`(免費 ids-only)→ 以 **Essentials 等級**取
   `類型 + 座標 + 名稱`(SKU `place_details_essentials` ≈ 5/1000;有 GeoJSON 座標時帶
   location bias 提高命中率)→ 寫回 `place_id_cache`。**不抓 Pro 欄位(照片/評分/營業時間/
   簡介),那延後到加入行程時**(見成本策略)。
4. **預覽 + 勾選:** 依清單分組列出解析結果(顯示解析到的名稱/地址讓使用者抓錯配),
   每筆可勾。這步同時把成本與寫入量框住(只處理你要的)。
5. **儲存:** 勾選的地點以中量 stub(含類型/座標)寫進 `saved_places`(server action,`upsert`
   on `(owner_id, list_name, place_id)` 做去重)。

## 收藏頁籤(SidePanel 第四頁籤)= 收藏版推薦引擎

- 在 `components/SidePanel.tsx` 頁籤列新增第四個頁籤 `collection`(暫定標籤「地圖收藏」,
  可改名)。`SidePanelTab` 型別加 `'collection'`,`TABS` 陣列加一項。資料**跨行程**
  (`saved_places` 綁 `owner_id`),每趟每天看到同一份收藏。
- **選取邏輯(免費,重用推薦的 helper):** 面板 per-day、帶 `dayIdx`/`dateIso`。取當天中心點
  `resolveDayCenter(days, dayIdx)`(中心點→當天行程→前一天→整趟)→ 把該使用者的 `saved_places`
  依距中心點遠近排序 → `bucketByCategory` 分甜點/景點/餐廳 → `splitShownReserve` 每類最多 5 張
  (shown)+ 其餘 reserve → `dedupeAndExclude` 濾掉已在當天行程/候選的地點。全程只用 stub 的
  類型+座標,**不打 API**。
- **呈現:** 重用 `DayRecommendations` / `RecommendationCard`(把收藏塑成 `DayRecommendation`:
  `reason='你的 Google Maps 收藏'`、`sourceLabel='地圖收藏 / <list_name>'`)。分類別子頁籤、
  「換一批」(切到 reserve)、空狀態,全與推薦一致。頂部另有「匯入 Google Maps 標籤」入口。
- **卡片動作(與推薦一模一樣,重用同一個 `RecommendationCard` 的 handler):**
  - **加入(`onAdd`):** 直接排進當天。因延後解析,加入當下先 `getPlaceDetails(place_id)`
    (付費 Pro、有快取;只付真正用到的)把 stub 補成完整 `Place`,再排進當天。可選回填
    `saved_places.place`,下次免付費。
  - **移到備用(`onArchive`):** 補全後寫進備用行程池(`trip_candidates` `list='archived'`,
    沿用 `archivePlace`)。
  - **刪除(`onDelete`):** 只從這次建議移除(client-side dismiss,記進當天的 excluded 集合),
    **不動 `saved_places`**——與推薦卡片語意一致。
- 可選同步:匯入時一併寫進既有 `user_place_index`(0009)讓推薦更準;MVP 可不做。

## 復用既有程式

- `lib/placeIdCache.ts` 的 `readCachedPlaceId` / `writeCachedPlaceId`:ID 解析的快取層。
- `app/actions/places.ts` 的 `findplacefromtext` 呼叫模式(新 helper 抽同一段拿 place_id,
  再接 Essentials 取類型+座標)。
- `app/actions/places.ts` 的 `getPlaceDetails`(付費 Pro、已快取):加進行程時補全用。
- `lib/utils/dayRecommend.ts` 的 `resolveDayCenter`,`app/actions/recommend.ts` 的
  `bucketByCategory` / `splitShownReserve` / `dedupeAndExclude` / `centroidOf`:收藏頁籤的選取
  邏輯直接重用(純函式、不打 API)。
- `components/DayRecommendations.tsx` + `RecommendationCard.tsx`:直接重用呈現與卡片動作。
- `ItineraryClient.tsx` 的 `handleAddRecommendation(dayIdx, rec)` 模式(經 SidePanel `onAdd`
  以 `dayIdx` 綁定傳入):新增 `handleAddCollectionPlace(dayIdx, place)` 走同一條「排進當天」路徑。
- `app/actions/candidates.ts` 的 `archivePlace`:卡片「移到備用」時寫進備用行程池。

## 錯誤處理

- **解析不到 / 配錯:** 預覽顯示解析到的名稱+地址;配不到的標為「找不到,略過」,不寫入。
- **檔案格式錯 / 空檔:** 明確錯誤訊息,不整批失敗;逐檔回報成功筆數。
- **大檔:** 預覽分頁 / 上限保護;Essentials 解析可並行但要限流避免打爆 Google(也省成本)。
- **重複匯入:** `upsert` 去重,回報「新增 N、已存在 M」。
- **匿名使用者:** 收藏頁籤的匯入入口需登入;未登入時顯示登入引導(帶 `next` 回行程頁)。

## 測試(TDD)

- 解析器單元測試:用**真實 Takeout 匯出**當 fixture(GeoJSON + CSV 各一),驗證欄位抽取、
  清單名推導、缺座標情形。
- `resolvePlaceEssentials`:mock Places API,驗證(a)命中快取不打 API、(b)取到類型+座標、
  (c)**不抓 Pro 欄位**(不呼叫照片/營業時間那段)、(d)有座標時帶 location bias。
- 選取邏輯(純函式、不打 API):`resolveDayCenter` + `bucketByCategory` + `splitShownReserve`
  + `dedupeAndExclude` 對一組 `saved_places` 排序分桶——每類最多 5、按距中心點排序、排除已在
  當天行程的地點、無中心點時的 fallback。
- RLS:使用者 A 讀不到 / 改不到使用者 B 的 `saved_places`(整合測試)。
- SidePanel:第四頁籤 `collection` 渲染 + 頁籤切換 + 分類別子頁籤;空狀態顯示匯入引導。
- 卡片動作:加入 → 觸發 `getPlaceDetails` 補全(mock)後排進當天(驗證未加入前不打 Pro API);
  移到備用 → `archivePlace`;刪除 → 只 dismiss、`saved_places` 不變。
- 去重測試:同清單同地點重複匯入只留一列。

## 未來(超出本次範圍)

- 清單重新命名 / 合併(需升級成獨立 lists 表)。
- 清單層級的批次加入(整個清單一次進備用池)。
- 收藏庫管理(從收藏庫永久刪除誤匯入的地點)。
- 收藏庫地點的付費資料背景預熱。
- 從「貼上公開清單網址」補一條匯入來源(可行性低、脆弱,暫不做)。
