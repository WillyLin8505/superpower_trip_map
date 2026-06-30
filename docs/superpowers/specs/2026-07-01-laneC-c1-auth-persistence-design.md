# Lane C / C1 — 登入 + 持久化地基 Design Spec

**日期：** 2026-07-01
**Lane：** C（多人協作揪團旅行）— 全新功能線，獨立於 Lane A（核心排程主線）與 Lane B（AI/research）
**子專案：** C1（Lane C 脊椎第 1 項）
**依賴：** 無（這是 Lane C 的地基；後續 C2–C5 依賴本案）
**狀態：** 設計定稿，待寫 plan

---

## 0. Lane C 脈絡（脊椎與本案定位）

Lane C 把這個目前**單機、單人、零持久化**的行程規劃器,演進成**多人揪團協作**工具。完整脊椎(每項各自一輪 spec→plan→build):

- **C1 登入 + 持久化地基** ← 本案
- C2 分享 + 成員(邀請連結 → 別人能加入同一趟 trip)
- C3 共享候選池(append-only 口袋名單)
- C4 候選池一鍵 `smart-arrange` 排程
- C5(選配)即時並發共編 / 任務分工 / 變更牆

**刻意的排序理由:** 並發衝突最難,故行程本體先以整包 JSONB `last-write-wins` 存(小團體可接受),真正的 realtime 共編延到 C5;append-only 的候選池(C3)先上即能拿到「群體一起收集 + 一鍵排程」的核心價值。

**產品決策(已與使用者確認):** 砍掉投票與分帳;登入只做 **Google + LINE** 兩種;地基用 **Supabase**。

---

## 1. 目標

為 app 補上三件目前完全沒有的東西,且不破壞現有「先試用」的低摩擦漏斗:

1. **身份** — Google(Supabase 原生)+ LINE(Supabase 自訂 OIDC provider)登入,單一 Supabase Auth 系統。
2. **持久化** — 行程可存到 Supabase Postgres,重整不再消失,擁有穩定網址 `/itinerary/[tripId]`。
3. **擁有權** — 每趟 trip 有 owner;RLS 確保只有 owner 能存取自己的 trip。

### 非目標(明確排除)
- **不強制全站登入**(產品決策):保留現有「首頁 → 即時產生行程」匿名流程;只有按「儲存」才需登入。維持低摩擦的首次價值體驗。
- **不做共享 / 邀請加入**:別人能開同一條連結 = C2。C1 的 trip 連結此時**只有 owner 自己能開**(RLS owner-only)。
- **不做即時並發共編**(C5):本案自動存檔為 `last-write-wins`,無衝突解析、無 presence。
- **不做候選池**(C3)。
- **不正規化行程內容**:`PlanResult` 整包存成 JSONB,不拆表(拆表只有 C5 細粒度共編才需要)。
- **不改排程引擎 / 拖拉 / 卡片等既有編輯邏輯**:只在外圍加「載入來源」與「存檔出口」。

---

## 2. 行為總覽

### 2.1 匿名試用(維持現狀)
首頁收集地點 → `sessionStorage('pendingPlaces')` → `/itinerary` → `planItinerary()` 產生 `PlanResult` → `ItineraryClient`。**行為不變**,只是多了一顆「儲存行程」按鈕。

### 2.2 儲存(新)
1. 在匿名的 `/itinerary` 上按「儲存行程」。
2. 未登入 → 導向登入頁(Google / LINE),登入後返回並續行儲存;已登入 → 直接續行。
3. 呼叫 `createTrip(plan, title)` → 寫入 `trips`(owner = 當前 user,plan = 整包 JSONB)→ 回傳 `tripId`。
4. 導向 `/itinerary/[tripId]`(持久化路由)。

### 2.3 持久化編輯(新)
- `/itinerary/[tripId]`:server component 以 server-side Supabase(帶 RLS)讀出 trip → `initial={plan}` + `tripId` 給 `ItineraryClient`。
- 在持久化 trip 上,任何編輯經既有 `scheduleRecalc` 落定後 → **debounced 自動存檔**(`saveTrip`),`last-write-wins`。
- 存檔狀態指示:「儲存中… / 已儲存 / 儲存失敗(重試)」。

### 2.4 我的行程(新)
- `/trips`:列出當前 user 的 trips(標題、更新時間),可開啟 / 改名 / 刪除。
- header:未登入顯示「登入」;已登入顯示頭像/暱稱 + 登出 + 「我的行程」。

---

## 3. 架構

職責邊界原則:**既有編輯核心(排程、拖拉、卡片)完全不動**;C1 只加「載入來源」與「存檔出口」兩個外圍接縫,讓 `ItineraryClient` 從「永遠記憶體」變成「可選地綁定一個 tripId 並自動回存」。

### 3.1 Supabase 客戶端(新基礎設施)
用 `@supabase/ssr`,session 走 cookie:
- `lib/supabase/client.ts` — browser client(`createBrowserClient`)。
- `lib/supabase/server.ts` — server client(`createServerClient`,讀寫 Next cookies);用於 server components 與 server actions,套用 RLS。
- `lib/supabase/admin.ts` — service-role client(僅 server,**繞過 RLS**,僅供 LINE OIDC 後置 upsert 等必要場景;預設不用)。
- 環境變數:`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`(server 限定,絕不暴露 client)。

### 3.2 認證流程
- **Google**:`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <callback> }})`(Supabase 原生)。
- **LINE**:於 Supabase Dashboard 設為 **Custom OIDC Provider**(LINE Login 為 OIDC 相容);前端以相同的 `signInWithOAuth` 介面、provider id 指向該自訂 provider 觸發。
- **Callback**:`app/auth/callback/route.ts`(Route Handler)以 `exchangeCodeForSession(code)` 換 session 並設 cookie,然後 redirect 回 `next` 參數指定頁(預設 `/trips` 或續行的儲存目標)。
- **登出**:server action 或 route 呼叫 `supabase.auth.signOut()`。
- **取得當前使用者**:server 端一律 `supabase.auth.getUser()`(驗證過的)而非僅讀 cookie。

### 3.3 資料層(server actions)
**新檔 `app/actions/trips.ts`**(全部使用 §3.1 server client,套 RLS):
```ts
createTrip(plan: PlanResult, title: string): Promise<{ tripId: string }>
getTrip(tripId: string): Promise<{ plan: PlanResult; title: string } | null>
saveTrip(tripId: string, plan: PlanResult): Promise<void>   // 自動存檔；last-write-wins
listTrips(): Promise<TripSummary[]>                          // { id, title, updatedAt }
renameTrip(tripId: string, title: string): Promise<void>
deleteTrip(tripId: string): Promise<void>
```
- 全部依賴 RLS 強制 owner-only;server action 內**不**自行做擁有權判斷(交給 RLS,避免雙重真相)。
- 未登入呼叫 → RLS 使其讀寫為空 / 失敗,server action 轉為明確錯誤(繁中)。

### 3.4 串接(ItineraryClient 改動,最小侵入)
新增**可選** props:
```ts
interface Props {
  initial: PlanResult
  tripId?: string          // 有值 = 持久化模式；無值 = 匿名試用模式
}
```
- **匿名模式(`tripId` 未定義)**:行為與現在完全相同,外加一顆「儲存行程」按鈕 → 觸發 §2.2。
- **持久化模式(`tripId` 有值)**:
  - 既有的 `savedPlanRef`(目前已存在但未實際持久化)改為「上次成功存到後端的 plan」之 dirty 比對基準。
  - 新增一個 debounced autosave effect:當 `plan !== savedPlanRef` 且非匿名 → 等編輯落定(沿用既有 2s recalc debounce 之後,或獨立的 ~1.5s autosave debounce)→ `await saveTrip(tripId, plan)` → 成功則更新 `savedPlanRef` 與「已儲存」狀態。
  - 失敗:顯示「儲存失敗,重試」,保留 dirty 狀態,下次編輯或手動重試再存。
- 存檔狀態以本地 state `saveState: 'idle' | 'saving' | 'saved' | 'error'` 表示。
- **離開未存**:`beforeunload` 在 dirty 時提示(輕量;非目標做完整衝突保護)。

### 3.5 路由
- `app/itinerary/[tripId]/page.tsx`(新,server component):`getTrip` → 不存在或無權 → `notFound()`;否則 render `<ItineraryClient initial={plan} tripId={tripId} />`(需確認 `ItineraryClient` 可在 server component 內以 client boundary 包裝,沿用既有 `'use client'` 模式)。
- `app/itinerary/page.tsx`(現有匿名路由):不變,`ItineraryClient` 不傳 `tripId`。
- `app/trips/page.tsx`(新):`listTrips` 清單頁。
- `app/auth/callback/route.ts`(新):OAuth callback。
- `app/login/page.tsx`(新):Google / LINE 兩顆按鈕;接受 `next` 查詢參數以便登入後續行。

---

## 4. 資料模型

### 4.1 Postgres schema(C1 只開一張表)
```sql
create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null default '未命名行程',
  plan        jsonb not null,                 -- 整包 PlanResult
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index trips_owner_id_idx on public.trips(owner_id);
```
- `plan` 為整包 `PlanResult`(見 `lib/types.ts`:`{ days, transportMode, startDate }`)。app 端型別權威不變,DB 只當不透明 JSONB 儲存。
- `updated_at` 由 `saveTrip` 端或 trigger 更新(用 `moddatetime` 或在 action 內 `set updated_at = now()`)。

### 4.2 RLS 政策(owner-only)
```sql
alter table public.trips enable row level security;

create policy "owner_select" on public.trips
  for select using (auth.uid() = owner_id);
create policy "owner_insert" on public.trips
  for insert with check (auth.uid() = owner_id);
create policy "owner_update" on public.trips
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner_delete" on public.trips
  for delete using (auth.uid() = owner_id);
```
- C2 將新增 `trip_members` 並把 select/update 政策放寬到「owner 或成員」。本案 schema 與政策刻意保留此擴充空間。

### 4.3 app 端型別
```ts
export interface TripSummary {
  id: string
  title: string
  updatedAt: string   // ISO
}
```
`PlanResult` 不變;不為持久化新增任何欄位(JSONB 直接收現有形狀)。

---

## 5. UI

### 5.1 登入頁 `/login`
- 兩顆按鈕:「使用 Google 登入」「使用 LINE 登入」。
- 接受 `?next=` 以便登入後返回原本動作(例如續行儲存)。

### 5.2 ItineraryClient
- 「儲存行程」按鈕(匿名模式顯示;持久化模式改為存檔狀態指示)。
- 存檔狀態列:「儲存中…」/「已儲存」/「儲存失敗,點此重試」。

### 5.3 `/trips` 我的行程
- 卡片或列表:標題、更新時間、開啟 / 改名 / 刪除。
- 空狀態:「還沒有儲存的行程,從首頁建立一個吧」。

### 5.4 Header
- 未登入:「登入」連結。
- 已登入:頭像 / 暱稱 + 「我的行程」+ 「登出」。

### 5.5 文案(繁體中文)
- 「儲存行程」「儲存中…」「已儲存」「儲存失敗,點此重試」
- 「使用 Google 登入」「使用 LINE 登入」
- 「我的行程」「未命名行程」「改名」「刪除」「登出」
- 未登入儲存提示:「登入後即可儲存此行程」

---

## 6. 元件與職責邊界

| 檔案 | 職責 | 依賴 |
|---|---|---|
| `lib/supabase/client.ts`(新) | browser client | `@supabase/ssr` |
| `lib/supabase/server.ts`(新) | server client(RLS) | `@supabase/ssr`、next cookies |
| `lib/supabase/admin.ts`(新) | service-role client(server only) | `@supabase/supabase-js` |
| `app/actions/trips.ts`(新) | create/get/save/list/rename/delete | server client |
| `app/auth/callback/route.ts`(新) | OAuth code → session | server client |
| `app/login/page.tsx`(新) | Google / LINE 登入按鈕 | browser client |
| `app/trips/page.tsx`(新) | 我的行程清單 | `listTrips` |
| `app/itinerary/[tripId]/page.tsx`(新) | 載入持久化 trip | `getTrip` |
| `app/itinerary/ItineraryClient.tsx`(改) | 可選 `tripId`、儲存按鈕、autosave、存檔狀態 | `createTrip`/`saveTrip` |
| `components/Header.tsx`(新/改) | 登入狀態 + 我的行程 + 登出 | server client |
| `lib/types.ts`(改) | 新增 `TripSummary` | — |
| `supabase/migrations/*.sql`(新) | `trips` 表 + RLS | — |

---

## 7. 錯誤處理與邊界

- **未登入儲存**:導向 `/login?next=...`,登入後續行;若使用者放棄,匿名 plan 仍在 sessionStorage,不遺失。
- **無權 / 不存在的 tripId**:`getTrip` 回 null → `notFound()`。
- **自動存檔失敗**(網路 / RLS):`saveState='error'`,保留 dirty,顯示重試;不丟失使用者編輯(仍在記憶體)。
- **並發覆寫**(同一 owner 兩個分頁):`last-write-wins`,本案接受(C5 才處理)。`beforeunload` 在 dirty 時輕量提示。
- **LINE OIDC 後置**:若需要把 LINE profile 映射 / 補資料,僅在 callback 後以 service-role(admin client)做最小 upsert;一般情況下 Supabase OIDC 自動建立 `auth.users` 列,無需額外處理。
- **Service-role key 外洩防護**:`admin.ts` 僅在 server 模組引用;以 lint / 檔案位置約束避免被 client bundle 引入。

---

## 8. 測試策略(TDD)

### 純 / 單元
- `app/actions/trips.ts`:以 mock 的 Supabase server client 驗證 create/get/save/list/rename/delete 的查詢構造與錯誤轉換(未登入 → 明確錯誤)。
- autosave dirty 比對:`plan` 變動 → 標記 dirty;存成功 → 清 dirty;存失敗 → 維持 dirty。

### 整合(jsdom / mock server actions)
- `ItineraryClient` 匿名模式:無 `tripId` → 顯示「儲存行程」;點按未登入 → 導向 `/login`。
- 持久化模式:有 `tripId` → 編輯落定後呼叫 `saveTrip`(mock)→ 狀態轉「已儲存」;mock reject → 「儲存失敗」且維持 dirty。
- 既有 `ItineraryClient` 全測試保持綠(`tripId` 為可選,匿名路徑行為不變 → 零既有 fixture 遷移)。

### e2e(Playwright)
- 登入(Google,LINE 視可測性可 mock OAuth)→ 儲存 → 重整 `/itinerary/[tripId]` → 行程仍在。
- `/trips` 列出、改名、刪除。
- RLS:A 使用者無法開啟 B 使用者的 tripId(回 notFound)。

### RLS 政策
- 以 Supabase 本地(`supabase start`)或政策單元測試驗證四條政策:非 owner 的 select/update/delete 皆被擋。

---

## 9. 全域約束

- TypeScript strict,無 `any`。
- 新增套件:`@supabase/ssr`、`@supabase/supabase-js`(僅此認證/DB 所需;不引入第二套 auth 如 NextAuth——Google 走 Supabase 原生、LINE 走 Supabase 自訂 OIDC)。
- UI 文案繁體中文。
- 可選 `tripId` prop + 維持匿名路徑 → 零既有 fixture 遷移、既有編輯邏輯不動。
- `last-write-wins` 自動存檔(本案範圍);realtime / 衝突解析屬 C5。
- service-role key 僅 server;RLS 為擁有權的單一真相。
- ⚠️ Windows Jest 原生 binding 既有坑:本機需要該 binding 存在但不可 commit(會破壞 Vercel/Linux 部署)——見專案記憶。

---

## 10. 外部前置設定(實作前需備妥)

- **Supabase 專案**:建立專案,取得 URL / anon key / service-role key;`supabase/migrations` 套用 §4 schema + RLS。
- **Google OAuth**:Google Cloud 建 OAuth client(redirect URI 指向 Supabase callback);在 Supabase Auth 啟用 Google 並填 id/secret。
- **LINE Login**:LINE Developers 建立 LINE Login channel(OIDC),取得 channel id/secret;在 Supabase Auth 以 Custom OIDC Provider 設定(issuer / client id / secret / scopes `openid profile`)。
- **環境變數**:`.env.local`(本機)與 Vercel(部署)設妥三個 key;`.env.local.example` 補上佔位。
