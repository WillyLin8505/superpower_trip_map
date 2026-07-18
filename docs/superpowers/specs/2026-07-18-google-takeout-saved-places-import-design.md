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
3. **分組:** 保留 Google Maps 原本的清單/標籤分組。
4. **成本策略:** 延後解析——匯入時只拿免費的 Place ID,付費的完整資料(照片/評分/
   營業時間)延到地點真正被加進某趟行程時才抓。
5. **UI 呈現:** 做成 `components/SidePanel.tsx` 的**第四個頁籤**(推薦行程 / LINE 討論 /
   備用行程 之外),非獨立頁面。
6. **加入行為:** 跟推薦卡片一樣可**直接排進當天行程**(SidePanel 是 per-day、帶 `dateIso`);
   延後解析下,加入當下才 `getPlaceDetails` 補全 + 付費。

## 非目標(YAGNI)

- 不做 OAuth 自動同步 / 背景輪詢(技術上不可行,見上)。
- 不在 app 內編輯 / 新建 / 重新命名 Google Maps 清單。
- 不做收藏庫的「重新匯出」或與行程成員共享收藏庫(共享發生在 `trip_candidates` 層)。
- 匯入時不抓付費 Place Details(延後解析)。
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
  place      jsonb not null,              -- 延後解析:先存最小 stub;加進行程時可回填完整資料
  note       text,                        -- Takeout CSV 的備註欄(可空)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, list_name, place_id)  -- 同一清單內去重
);
create index if not exists saved_places_owner_idx on public.saved_places(owner_id);
-- RLS: select/insert/update/delete 皆 using/with check (auth.uid() = owner_id),四條 policy。
```

`place` jsonb 在延後解析下是**最小 stub**:`{ id, placeId, name, lat, lng, address,
type:'attraction'(預設), openingHours:null, rating:null, photoUrl:null,
photoUrls:[], description:null, localizedName:null }`。地點被加進行程時以
`getPlaceDetails(place_id)` 補全,並可選擇性把完整結果回填這一列的 `place`。

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
3. **免費解析 Place ID(新 helper,不走 `searchPlace` 整包):** 新增
   `resolvePlaceIdOnly(title, { lat, lng }?)`:先查 `place_id_cache`(免費)→
   `findplacefromtext` 只帶 `fields=place_id`(SKU `find_place_from_text_id_only`,成本 0)
   → 寫回快取。有 GeoJSON 座標時帶 location bias 提高命中率。**絕不呼叫 `getPlaceDetails`**
   (那是付費的,見成本策略)。
4. **預覽 + 勾選:** 依清單分組列出解析結果(顯示解析到的名稱/地址讓使用者抓錯配),
   每筆可勾。這步同時把成本與寫入量框住(只處理你要的)。
5. **儲存:** 勾選的地點以最小 stub 寫進 `saved_places`(server action,`upsert` on
   `(owner_id, list_name, place_id)` 做去重)。

## 收藏頁籤(SidePanel 第四頁籤)+ 直接排進行程

- 在 `components/SidePanel.tsx` 頁籤列新增第四個頁籤 `collection`(暫定標籤「地圖收藏」,
  可改名)。`SidePanelTab` 型別加 `'collection'`,`TABS` 陣列加一項。
- 頁籤內容:頂部「匯入 Google Maps 標籤」入口 + 依 `list_name` 分組顯示收藏(延後解析下
  先只有名稱/地址,無照片)。空狀態引導去匯入。
- 資料**跨行程**(`saved_places` 綁 `owner_id`):每趟行程、每天的面板看到同一份收藏;
  「加入」則排進**當前這一天**(面板已 per-day、帶 `dateIso`,與推薦一致)。
- **加入單一地點(跟推薦一樣直接排進當天):** 沿用推薦的 `onAdd(place)` 流程。因延後解析,
  加入當下先 `getPlaceDetails(place_id)`(付費 Pro、有快取;只付真正用到的)把 stub 補成完整
  `Place`,再排進當天。可選:把補全結果回填 `saved_places.place`,下次免付費。
- **整個清單加入:** 清單標題提供「全部加入」→ 全部補全後加入**備用行程池**(`trip_candidates`
  `list='archived'`,沿用 `archivePlace`),讓使用者再逐一排進各天(一次塞進單一天無意義)。
- 可選同步:匯入時一併寫進既有 `user_place_index`(0009)讓推薦更準;MVP 可不做。

## 復用既有程式

- `lib/placeIdCache.ts` 的 `readCachedPlaceId` / `writeCachedPlaceId`:免費 ID 解析的快取層。
- `app/actions/places.ts` 的 `findplacefromtext` 呼叫模式(新 helper 抽同一段,只到 place_id)。
- `app/actions/places.ts` 的 `getPlaceDetails`(付費、已快取):加進行程時補全用。
- `ItineraryClient.tsx` 的 `handleAddRecommendation(dayIdx, rec)` 模式(經 SidePanel `onAdd`
  以 `dayIdx` 綁定傳入):新增 `handleAddCollectionPlace(dayIdx, place)` 走同一條「排進當天」路徑。
- `app/actions/candidates.ts` 的 `archivePlace`:整個清單加入時寫進備用行程池。

## 錯誤處理

- **解析不到 / 配錯:** 預覽顯示解析到的名稱+地址;配不到的標為「找不到,略過」,不寫入。
- **檔案格式錯 / 空檔:** 明確錯誤訊息,不整批失敗;逐檔回報成功筆數。
- **大檔:** 預覽分頁 / 上限保護;免費 ID 解析可並行但要限流避免打爆 Google。
- **重複匯入:** `upsert` 去重,回報「新增 N、已存在 M」。
- **匿名使用者:** 收藏頁籤的匯入入口需登入;未登入時顯示登入引導(帶 `next` 回行程頁)。

## 測試(TDD)

- 解析器單元測試:用**真實 Takeout 匯出**當 fixture(GeoJSON + CSV 各一),驗證欄位抽取、
  清單名推導、缺座標情形。
- `resolvePlaceIdOnly`:mock `findplacefromtext`,驗證(a)命中快取不打 API、(b)只帶
  `fields=place_id`、(c)絕不呼叫 `getPlaceDetails`、(d)有座標時帶 location bias。
- RLS:使用者 A 讀不到 / 改不到使用者 B 的 `saved_places`(整合測試)。
- SidePanel:第四頁籤 `collection` 渲染 + 頁籤切換測試;空狀態顯示匯入引導。
- 加入單一地點:點「加入」→ 觸發 `getPlaceDetails` 補全(mock)後排進當天行程的測試
  (驗證延後解析:未加入前不打付費 API)。
- 「整個清單加進 trip_candidates」整合測試:含 `getPlaceDetails` 補全(mock)。
- 去重測試:同清單同地點重複匯入只留一列。

## 未來(超出本次範圍)

- 清單重新命名 / 合併(需升級成獨立 lists 表)。
- 收藏庫地點的付費資料背景預熱。
- 從「貼上公開清單網址」補一條匯入來源(可行性低、脆弱,暫不做)。
