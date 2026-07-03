# Lane C / C2 — 分享 + 成員 Design Spec

**日期：** 2026-07-03
**Lane：** C(多人協作揪團旅行)
**子專案：** C2(Lane C 脊椎第 2 項)
**依賴：** C1(登入 + 持久化地基:`trips` 表 + owner-only RLS + Supabase Auth + `/itinerary/[tripId]`)—— 尚在 PR #2,**C2 疊在 C1 分支之上**(branch `lane/c2-sharing` from `lane/c1-auth-persistence`)。
**狀態：** 設計定稿,待寫 plan

---

## 0. 定位

C1 讓行程能存、有穩定網址,但**只有 owner 自己能開**。C2 把它變成**可揪團**:owner 產生一條可分享的邀請連結,朋友點連結→登入→成為該 trip 的成員(editor),即可一起編輯同一份行程。RLS 從 owner-only 放寬成 **owner-或-member**。

**已確認的產品決策:** 邀請=**單一可重產的分享連結 token**(不做 email 邀請、不做過期時效);角色=**owner + editor**(加入者即可共編,不做 viewer);加入操作走 **server action + admin client**(不做 DB function)。即時並發共編 / presence 仍屬 C5(本案維持 last-write-wins)。

---

## 1. 目標

1. **邀請連結**:owner 為 trip 產生一條 `/join/<token>` 連結,可複製分享(貼 LINE 群等)。
2. **加入**:任何登入者開邀請連結即成為該 trip 的 member(editor)。
3. **共編權**:member 能讀取與編輯(autosave)該 trip,如同 owner;只有 owner 能刪 trip 與管理成員。
4. **成員管理**:owner 看成員清單、移除成員、重產連結(撤銷舊連結);member 可離開。

### 非目標(明確排除)
- 不做即時並發共編 / presence(C5);維持 last-write-wins。
- 不做 **viewer** 角色、不做 **email 邀請**、不做邀請 **過期時效**(單一可重產 token 即可)。
- 不做候選池(C3)。
- 不改 C1 既有編輯核心(排程/拖拉/卡片/autosave 機制);只放寬 RLS 與新增分享/成員周邊。

---

## 2. 資料模型

### 2.1 schema 變更(migration `0002_sharing.sql`)
```sql
-- trips 加一欄:可分享邀請 token（owner 首次分享時產生；重產=撤銷舊連結）
alter table public.trips add column if not exists invite_token uuid;
create unique index if not exists trips_invite_token_idx
  on public.trips(invite_token) where invite_token is not null;

-- 新表：成員（owner 不入表，靠 trips.owner_id；本表僅存非 owner 的 editor）
create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_id_idx on public.trip_members(user_id);
```

### 2.2 成員關係模型
- **owner**:`trips.owner_id`(不在 `trip_members`)。
- **member(editor)**:`trip_members` 一列。
- 「是這個 trip 的參與者」= `owner_id = auth.uid()` **OR** 在 `trip_members`。此判斷會被多條 RLS policy 重用 → 抽成一個 SQL helper 函式避免重複:
```sql
create or replace function public.is_trip_participant(t uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.trips where id = t and owner_id = auth.uid())
      or exists(select 1 from public.trip_members where trip_id = t and user_id = auth.uid());
$$;
```
> `security definer` 讓函式內查 `trip_members` 時不遞迴觸發 RLS(避免 policy 互相遞迴)。函式只回布林,不外洩資料。

### 2.3 RLS 變更
**`trips`(放寬 select / update;delete 維持 owner-only)**
```sql
drop policy "owner_select" on public.trips;
drop policy "owner_update" on public.trips;

create policy "participant_select" on public.trips
  for select using (public.is_trip_participant(id));
create policy "participant_update" on public.trips
  for update using (public.is_trip_participant(id))
  with check (public.is_trip_participant(id));
-- owner_insert、owner_delete 維持不變（新增/刪除仍限 owner）
```

**欄位級保護(關鍵——RLS 控「哪些列」,column grant 控「哪些欄」):** `participant_update` 允許 member 更新整列,若不加限制,member 可直接打 API 改 `invite_token` 甚至 `owner_id`。故限制 `authenticated` 只能更新可協作的三欄:
```sql
revoke update on public.trips from authenticated;
grant  update (title, plan, updated_at) on public.trips to authenticated;
-- owner_id / invite_token / id / created_at → authenticated 無 update 權；只有 service-role（admin client）能寫。
```
- 效果:member 經 app(`saveTrip` 只改 `plan`+`updated_at`)正常運作;但任何人(含 member)都無法經一般 session 竄改 `invite_token`/`owner_id`。
- 連帶:`getInviteLink`/`rotateInvite`(寫 `invite_token`)因此**必須用 admin client**(見 §3.2),不能用一般 server client。
**`trip_members`(新)**
```sql
alter table public.trip_members enable row level security;
-- 參與者可看該 trip 的成員清單
create policy "participant_select_members" on public.trip_members
  for select using (public.is_trip_participant(trip_id));
-- 成員可移除自己（離開）；owner 移除任何人
create policy "self_or_owner_delete" on public.trip_members
  for delete using (
    user_id = auth.uid()
    or exists(select 1 from public.trips where id = trip_id and owner_id = auth.uid())
  );
-- 不開放 client 端 insert：加入一律走 joinTrip server action（admin client）
```

### 2.4 免費得到的副作用(靠 RLS,零 action 邏輯變更)
- C1 的 `listTrips`(`select id,title,updated_at`)在 `participant_select` 下**自動**回傳「我擁有的 + 我加入的」。
- C1 的 `saveTrip`/`getTrip`(靠 RLS)對 member **自動生效**——member 能載入與 autosave。
- 唯一要注意:`saveTrip` 已在 C1 加了 `.select('id')` + `!data?.length` 的 0-row 偵測 → member 被移除後嘗試存檔會正確報錯(不再假「已儲存」)。

---

## 3. 加入流程與 server actions

### 3.1 `/join/[token]` 路由(server component)
- 讀 `params.token`。
- `getUser()` 為 null → `redirect('/login?next=/join/<token>')`。
- 已登入 → 呼叫 `joinTrip(token)` → 成功回 `{ tripId }` → `redirect('/itinerary/<tripId>')`;token 無效 → 顯示「邀請連結無效或已失效」。

### 3.2 server actions(新檔 `app/actions/members.ts`)
```ts
joinTrip(token: string): Promise<{ tripId: string }>          // 見下；用 admin client
getInviteLink(tripId: string): Promise<{ token: string }>     // owner：無 token 則產生並寫回，回傳現有 token
rotateInvite(tripId: string): Promise<{ token: string }>      // owner：換新 token（撤銷舊連結）
listMembers(tripId: string): Promise<TripMember[]>            // 參與者可見；含 owner + members
removeMember(tripId: string, userId: string): Promise<void>   // owner
leaveTrip(tripId: string): Promise<void>                      // 自己
```
- **`joinTrip`**(唯一繞 RLS 的操作):
  1. `getUser()`;null → throw `NOT_AUTHENTICATED`。
  2. **admin client**(`lib/supabase/admin.ts`,service-role)以 `invite_token = token` 查 trip;查無 → throw `INVALID_INVITE`。
  3. 若 `trip.owner_id === user.id` 或已在 `trip_members` → **idempotent**,直接回 `{ tripId }`(不重複 insert)。
  4. 否則 admin `insert trip_members (trip_id, user_id, 'editor')`;回 `{ tripId }`。
  - 為何 admin:純 RLS 無法在 insert 時驗「token 正確」(policy 看不到 token 值)。用受控 server action + admin 是標準做法;**只有此 join 操作繞 RLS**,其餘讀寫全靠 RLS。
- **`getInviteLink`/`rotateInvite`**(寫 `invite_token`,§2.3 已用 column grant 鎖住 authenticated 不能寫此欄)→ **必須用 admin client**:先 `getUser()` + 讀 trip 驗 `trip.owner_id === user.id`(非 owner → throw),通過後 admin `update invite_token`。owner 把關在 action(身分)+ column grant 在 DB(防繞過)雙層。`rotateInvite` 產生新 uuid 覆寫;舊 token 之後 `joinTrip` 查無 → 自動失效。
- **`removeMember`/`leaveTrip`**:靠 `trip_members` 的 delete policy(self-or-owner);action 為薄包裝。
- **型別**:`TripMember { userId: string; name: string; avatarUrl: string | null; role: 'owner' | 'editor'; isSelf: boolean }`(name/avatar 由 admin 或 server 讀 `auth.users` metadata 補上;owner 由 `trips.owner_id` 合成一筆 role='owner')。

### 3.3 idempotent 與競態
- `joinTrip` 對「已是成員 / 是 owner」為 no-op 回傳,重點覆蓋「同一連結多人多次點」。
- `trip_members` PK `(trip_id, user_id)` 保證同一人不重複;並發 double-insert 由 PK 擋(捕捉唯一鍵衝突視為已加入)。

---

## 4. UI

### 4.1 成員面板(`/itinerary/[tripId]`)
- 於行程頁加一個「成員」區塊(server 讀 `listMembers` + 當前 user 是否 owner)。
- **owner 視角**:邀請連結(唯讀輸入框 + 「複製連結」按鈕)、「重新產生連結」、成員清單(每人可「移除」)。
- **member 視角**:成員清單(唯讀)、「離開行程」按鈕。
- owner 尚未產生連結時顯示「產生邀請連結」按鈕(呼叫 `getInviteLink`)。

### 4.2 `/join/[token]`
- 純轉導頁(見 §3.1);無效 token 顯示明確訊息 + 回首頁連結。

### 4.3 文案(繁體中文)
- 「邀請成員」「邀請連結」「複製連結」「已複製」「重新產生連結」「移除」「離開行程」「產生邀請連結」
- 「邀請連結無效或已失效」「你已加入這個行程」

---

## 5. 元件與職責邊界

| 檔案 | 職責 | 依賴 |
|---|---|---|
| `supabase/migrations/0002_sharing.sql`(新) | invite_token 欄、trip_members 表、is_trip_participant()、RLS 變更 | C1 `0001_trips.sql` |
| `app/actions/members.ts`(新) | join/getInviteLink/rotate/listMembers/removeMember/leaveTrip | server client、admin client |
| `app/join/[token]/page.tsx`(新) | 加入轉導頁 | `joinTrip`、auth |
| `components/MembersPanel.tsx`(新,client) | 邀請連結 + 複製 + 成員清單 + 移除/離開 | members actions |
| `app/itinerary/[tripId]/page.tsx`(改) | 傳入 members + isOwner 給下游;掛 MembersPanel | `listMembers`、getUser |
| `lib/types.ts`(改) | `TripMember` 型別 | — |

C1 既有檔案(`ItineraryClient`、`trips.ts`、`server.ts`/`admin.ts`)**不改邏輯**,只被 §2.4 的 RLS 放寬自動涵蓋。

---

## 6. 錯誤處理與邊界

- **未登入開 join**:導 `/login?next=/join/<token>`,登入後回來自動加入。
- **無效 / 已重產的 token**:`joinTrip` throw `INVALID_INVITE` → join 頁顯示「邀請連結無效或已失效」。
- **重複加入 / owner 點自己的連結**:idempotent no-op。
- **被移除後仍開著分頁**:RLS 使其 select/update 落空;`saveTrip` 的 0-row 偵測(C1)→ 顯示「儲存失敗」;`getTrip` → notFound。
- **owner 專有操作**(rotate/getInviteLink/removeMember):action 內驗 owner;非 owner 呼叫 → throw 明確錯誤。
- **admin client 僅用於 joinTrip**;`import 'server-only'` 已保護 service-role key(C1)。

---

## 7. 測試策略(TDD)

### RLS 政策(本機 Supabase / 政策斷言)
- member 可 select/update 該 trip,不可 delete;非成員完全看不到;離開後失去 select/update。
- `is_trip_participant` 對 owner / member / 外人回 true/true/false。
- `trip_members` delete:self 可、owner 可移除他人、他人不可。

### server actions(mock supabase server + admin)
- `joinTrip`:有效 token → insert 並回 tripId;無效 token → throw INVALID_INVITE;已是成員 / 是 owner → idempotent no-op;未登入 → NOT_AUTHENTICATED。
- `getInviteLink`:owner 無 token → 產生並回;有 token → 回既有;非 owner → throw。
- `rotateInvite`:換新 token;舊 token 之後 `joinTrip` 失效;非 owner → throw。
- `listMembers`:回 owner + members,`isSelf` 正確。
- `removeMember`/`leaveTrip`:權限與呼叫路徑。

### 整合(jsdom)
- MembersPanel:owner 視角顯示連結+複製+移除;member 視角顯示離開;複製連結呼叫 clipboard。
- join 頁:未登入導 login(next 帶 token);已登入呼叫 joinTrip 後導 `/itinerary/<id>`;無效 token 顯示訊息。

### 迴歸
- C1 全測試保持綠;owner-only 行為在放寬後仍正確(owner 全權、delete 仍限 owner)。

---

## 8. 全域約束

- TypeScript strict,無 `any`。
- 沿用單一 Supabase Auth;`joinTrip` 是**唯一**繞 RLS 的操作(admin client),其餘全靠 RLS。
- RLS 為參與權的單一真相;`invite_token` 的 owner 專有寫入於 action 明確把關(欄位級 RLS 例外)。
- UI 文案繁體中文。
- 新增欄位/表為 additive;C1 既有 plan 物件與測試零遷移。
- 維持 last-write-wins(realtime 屬 C5)。
- ⚠️ Windows Jest 原生 binding 既有坑;worktree 用 sibling 目錄(非 `.claude/worktrees`,避 next/jest 找不到測試)。

---

## 9. 外部前置(承 C1;live 驗證延後同 C1)

- C1 的 Supabase 專案 + Google/LINE OAuth 需先就緒(目前待使用者金鑰)。
- C2 的 `0002_sharing.sql` migration 需套用到同一 Supabase 專案。
- live 驗證(套 migration、真實多帳號加入、RLS 跨成員驗證、join e2e)延後至金鑰就緒——與 C1 的 code-first 策略一致。
