# Lane C / C5 LINE 群組候選池入口 Design Spec

**Date:** 2026-07-07  
**Lane:** C, collaborative group travel  
**Sub-project:** C5, LINE group candidate ingest  
**Depends on:** C2 sharing/membership, C3 candidate pool, C4 candidate arrange  
**Status:** Design accepted; implementation plan pending

---

## 1. Goal

讓使用者在 LINE 群組討論行程時，可以直接把景點、Google Maps 連結、旅遊文章網址丟到群組中，由 LINE bot 自動加入該行程的候選池。

核心情境：

1. 每個同行者都在 LINE 群組裡分享想去的地點或文章。
2. LINE bot 已加入該群組。
3. 群組先綁定到一個 trip。
4. 綁定後，群組內的新地點訊息會自動進入 C3 `trip_candidates`。

本案是 C3 候選池的新入口，不改變 C3/C4 的候選池與推薦排入語意。

---

## 2. Scope

### In Scope

- LINE Messaging API webhook endpoint。
- LINE webhook signature 驗證。
- LINE 群組綁定一個 trip。
- `/綁定 <行程分享連結>` command。
- `/解除綁定` command。
- 解析三種候選來源：
  - Google Maps 地點連結。
  - 一般旅遊文章網址。
  - 純文字地點名稱。
- 自動寫入 `trip_candidates`。
- 候選來源 metadata，讓 UI 可顯示「LINE 群組 / 使用者名稱加入」。
- 重複地點去重。

### Out of Scope

- LINE 帳號與 Supabase Auth user 的一對一綁定。
- 群組內個別成員權限驗證。
- 一個 LINE 群組同時綁定多個 trip。
- LINE private chat 的完整操作體驗。
- 投票、留言串、即時同步衝突解決。
- 背景 worker 的部署細節；本 spec 定義 job table 與處理邊界，實作計畫再決定 runtime。

---

## 3. Product Decisions

### 3.1 One Active Trip Per LINE Group

一個 LINE 群組同時只能綁定一個 active trip。

理由：LINE 群組通常對應一次旅行討論。單 trip 綁定讓 bot 行為可預期，也避免每則訊息都要猜測要寫入哪個候選池。

若要換行程，使用者先 `/解除綁定`，再 `/綁定 <新行程分享連結>`。

### 3.2 Group Members Are Treated As Participants

產品假設：能在該 LINE 群組討論的人，都視為這趟旅行的 participant。

MVP 不做 LINE group member 與 Supabase member 的逐一映射。任何持有有效 trip 分享連結的人都可以在 LINE 群組內綁定該 trip。後續候選寫入使用 trip owner 作為 C3 `added_by`，另外用 source metadata 保留 LINE 使用者顯示名。

This keeps C3 RLS semantics intact while avoiding a premature LINE account-linking system. A future version can replace this with per-user LINE account mapping.

### 3.3 Unbound Groups Stay Silent

未綁定群組收到一般地點、網址、純文字時，bot 不回覆，避免干擾群組聊天。

只有明確 command 需要回覆，例如 `/綁定` 格式錯誤或 `/解除綁定`。

---

## 4. Data Model

### 4.1 `trip_line_groups`

新增群組綁定表：

```sql
create table if not exists public.trip_line_groups (
  id            uuid primary key default gen_random_uuid(),
  line_group_id text not null,
  trip_id       uuid not null references public.trips(id) on delete cascade,
  write_as_user_id uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_message_at timestamptz
);

create unique index if not exists trip_line_groups_active_group_idx
  on public.trip_line_groups(line_group_id)
  where status = 'active';

create index if not exists trip_line_groups_trip_id_idx
  on public.trip_line_groups(trip_id);
```

`write_as_user_id` is the Supabase user used for `trip_candidates.added_by`. In MVP this is the trip owner.

`status` values:

- `active`: webhook 會把候選寫入此 trip。
- `disabled`: 已解除綁定，保留 audit trail。

綁定時若同一 `line_group_id` 已有 active row，必須先 disabled 舊 row，再新增或更新成新 trip。MVP command UX 要求使用者先 `/解除綁定`，但資料層仍要保證唯一 active binding。

### 4.2 `trip_candidates.source`

在 C3 `trip_candidates` 增加來源 metadata：

```sql
alter table public.trip_candidates
  add column if not exists source jsonb;
```

LINE 來源格式：

```ts
interface LineCandidateSource {
  kind: 'line_group'
  lineGroupId: string
  lineUserId?: string
  lineDisplayName?: string
  messageId: string
  messageText?: string
  sourceUrl?: string
}
```

C3 既有 `Candidate` type 可先不強制暴露完整 `source`，但 `listCandidates` 應可回傳足夠資訊讓 UI 顯示來源。

### 4.3 `line_ingest_jobs`

Webhook 要快速 ACK LINE，因此新增 job table：

```sql
create table if not exists public.line_ingest_jobs (
  id            uuid primary key default gen_random_uuid(),
  line_group_id text,
  line_user_id  text,
  message_id    text not null,
  message_text  text,
  event_payload jsonb not null,
  status        text not null default 'queued',
  error         text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create unique index if not exists line_ingest_jobs_message_id_idx
  on public.line_ingest_jobs(message_id);
```

`status` values: `queued | processing | done | ignored | failed`。

---

## 5. Architecture

### 5.1 Route

新增：

```txt
POST /api/line/webhook
```

Responsibilities:

- Read raw request body.
- Validate `x-line-signature` using `LINE_CHANNEL_SECRET`.
- Parse LINE webhook events.
- For each supported message event:
  - If command, handle immediately when cheap.
  - Otherwise enqueue `line_ingest_jobs`.
- Return 200 quickly after validation.
- Return 401 for invalid signature.

### 5.2 LINE Client

新增 server-only helper:

```ts
replyLineMessage(replyToken: string, text: string): Promise<void>
getLineProfile(groupId: string, userId: string): Promise<{ displayName: string } | null>
```

Uses `LINE_CHANNEL_ACCESS_TOKEN`.

The app must never expose LINE channel secret or access token to client components.

### 5.3 Binding Service

Create a server-only module, for example `lib/line/bindings.ts`:

```ts
bindLineGroupToTrip(input: {
  lineGroupId: string
  tripLinkOrToken: string
}): Promise<{ tripId: string }>

unbindLineGroup(input: {
  lineGroupId: string
}): Promise<void>

getActiveLineGroupBinding(lineGroupId: string): Promise<{
  tripId: string
  writeAsUserId: string
} | null>
```

Binding uses a controlled server path and must verify the trip exists. Because the product decision treats group members as participants, a valid trip or join link is enough to bind the LINE group. The binding stores `write_as_user_id = trips.owner_id` for future candidate inserts.

### 5.4 Candidate Writer Core

C3 currently exposes user-facing actions. C5 needs a server-only writer that can be called by webhook processing without client form context:

```ts
addCandidateFromLine(input: {
  tripId: string
  writeAsUserId: string
  place: Place
  source: LineCandidateSource
}): Promise<'added' | 'duplicate'>
```

This function:

- Checks duplicate by `trip_id` + `place.placeId` when present.
- Inserts into `trip_candidates` with `added_by = writeAsUserId`.
- Stores `source`.
- Does not bypass C3 ownership semantics except for the controlled LINE group binding path.

---

## 6. Command Flow

### 6.1 `/綁定 <行程分享連結>`

Supported examples:

```txt
/綁定 https://example.com/join/<token>
/綁定 https://example.com/itinerary/<tripId>
```

Flow:

1. Webhook receives group message.
2. Verify signature.
3. Parse command and extract link/token.
4. Resolve trip.
5. Store `line_group_id -> trip_id`.
6. Store `write_as_user_id = trip.owner_id`.
7. Reply: `已綁定此 LINE 群組到行程。`

Invalid command format reply:

```txt
請輸入 /綁定 <行程分享連結>
```

Invalid trip link reply:

```txt
找不到這個行程，請確認分享連結是否正確。
```

### 6.2 `/解除綁定`

Flow:

1. Look up active binding by `line_group_id`.
2. If found, set `status = 'disabled'`.
3. Reply: `已解除此 LINE 群組的行程綁定。`

If no active binding:

```txt
此 LINE 群組目前沒有綁定行程。
```

---

## 7. Ingest Flow

### 7.1 Unbound Group

If the group has no active binding and the message is not a supported command, do nothing and do not reply.

### 7.2 Google Maps URL

Detection:

- URL host matches Google Maps patterns, for example `maps.app.goo.gl`, `google.com/maps`, `goo.gl/maps`.

Processing:

1. Resolve shortened URL when needed.
2. Extract likely place query or place id when available.
3. Use existing Places search/detail path to produce `Place`.
4. Write to candidate pool.
5. Reply:
   - added: `已加入候選池：{placeName}`
   - duplicate: `已在候選池：{placeName}`

### 7.3 General Travel Article URL

Detection:

- Message includes URL but it is not Google Maps.

Processing:

1. Reuse existing scrape/extract itinerary pipeline.
2. Verify each extracted place through existing search.
3. Insert unique candidates.
4. Reply:
   - added one: `已加入候選池：{placeName}`
   - added multiple: `已加入 {count} 個候選。`
   - none found: `找不到可加入候選池的地點。`

### 7.4 Plain Text Place Name

Detection:

- Non-command text with no URL.
- Ignore very short messages after trimming, for example under 2 characters.

Processing:

1. Treat full text as a place search query.
2. Use existing `searchPlace`.
3. Insert first result only.
4. Reply:
   - added: `已加入候選池：{placeName}`
   - duplicate: `已在候選池：{placeName}`
   - none found: `找不到可加入候選池的地點。`

---

## 8. UI Changes

Candidate UI should display LINE source when available:

- Existing `addedByName` remains.
- If `source.kind === 'line_group'`, show source text like:
  - `LINE 群組 / {lineDisplayName} 加入`
  - fallback: `LINE 群組加入`

No new major UI surface is required for MVP beyond source display. Binding and unbinding happen inside LINE.

---

## 9. Error Handling

- Invalid signature: route returns 401, no LINE reply.
- Unsupported LINE event type: ignore.
- Private chat message: reply only for commands; otherwise ignore.
- Unbound group general message: ignore silently.
- Invalid bind command: reply with usage.
- Invalid trip link: reply with not found message.
- Existing active binding: reply that the group is already bound and ask user to `/解除綁定` first.
- No place found: reply `找不到可加入候選池的地點。`
- Duplicate place: reply `已在候選池：{placeName}`.
- LINE reply API failure: log job error; do not retry candidate insert if insert already succeeded.
- Article extraction timeout/failure: mark job failed and reply `暫時無法解析這個連結，請稍後再試。`

---

## 10. Environment Variables

Required:

```txt
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
```

Optional:

```txt
LINE_WEBHOOK_PROCESSING_MODE=sync|job
```

MVP should default to job-based processing when the deployment has a worker/cron path. Local development may use sync mode for easier testing.

---

## 11. Tests

### Unit Tests

- LINE signature verification accepts valid body/signature.
- LINE signature verification rejects invalid signature.
- Command parser:
  - `/綁定 <url>`.
  - `/解除綁定`.
  - malformed `/綁定`.
- URL classifier:
  - Google Maps URLs.
  - general URLs.
  - plain text.
- Candidate writer:
  - inserts with `added_by = writeAsUserId`.
  - stores `source`.
  - skips duplicate `placeId`.

### Server Action / Service Tests

- `bindLineGroupToTrip` creates active binding.
- active binding uniqueness is enforced per LINE group.
- `unbindLineGroup` disables active binding.
- `getActiveLineGroupBinding` returns null for disabled binding.

### Route Tests

- invalid signature returns 401.
- valid webhook returns 200.
- unbound group non-command does not reply.
- bind command replies success.
- plain text in bound group enqueues ingest job.

### Integration Gates

- Existing C3 candidate tests remain green.
- Existing C4 candidate arrange tests remain green.
- Full `npx jest`.
- `npm run lint`.
- `npm run build`.

Live verification:

- Configure LINE Messaging API channel.
- Set webhook URL.
- Add bot to a LINE group.
- Bind group to a trip.
- Send Google Maps URL, article URL, and plain text place.
- Confirm candidates appear in `/itinerary/[tripId]`.

---

## 12. Acceptance Criteria

- A LINE group can be bound to exactly one active trip.
- Unbound groups do not receive bot replies for normal messages.
- Bound groups can add candidates from Google Maps URLs, article URLs, and plain text.
- Duplicate places are not inserted twice.
- Candidates added from LINE show LINE source information.
- Candidate writes use `write_as_user_id` as `added_by`.
- LINE webhook secrets remain server-only.
- Invalid signatures are rejected.
