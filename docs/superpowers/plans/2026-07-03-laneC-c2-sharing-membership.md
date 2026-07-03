# Lane C / C2 — 分享 + 成員 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 trip owner 產生可分享的邀請連結,朋友點連結→登入→成為 editor 成員,一起編輯同一份行程;RLS 從 owner-only 放寬成 owner-或-participant。

**Architecture:** 疊在 C1 之上(branch `lane/c2-sharing` from `lane/c1-auth-persistence`)。新增 `trip_members` 表 + `trips.invite_token` 欄 + `is_trip_participant()` security-definer 函式 + 放寬的 RLS + 欄位級 grant。加入操作(`joinTrip`)與寫 `invite_token` 的操作(`getInviteLink`/`rotateInvite`)走 **admin client**(唯一繞 RLS 之處);其餘讀寫全靠 RLS。C1 的 `listTrips`/`saveTrip`/`getTrip` 靠 RLS 放寬自動對 member 生效,不改邏輯。

**Tech Stack:** Next.js 14(App Router)、TypeScript strict、`@supabase/ssr` + `@supabase/supabase-js`、Supabase Postgres + RLS + column grants、Jest(ts-jest/jsdom)。

**Spec:** `docs/superpowers/specs/2026-07-03-laneC-c2-sharing-membership-design.md`

## Global Constraints

- TypeScript strict,無 `any`(必要處明確型別 / `unknown`)。
- UI 文案繁體中文(文案見 spec §4.3)。
- `joinTrip`、`getInviteLink`、`rotateInvite` 用 **admin client**(繞 RLS);為唯一繞 RLS 的操作。其餘全靠 RLS。
- RLS 為參與權的單一真相;`invite_token`/`owner_id` 只有 service-role 能寫(column grant),app 側 `authenticated` 只能 update `title/plan/updated_at`。
- 新增欄/表為 additive;C1 既有 plan 物件與測試零遷移;C1 全測試須保持綠。
- CODE-FIRST:migration 只寫檔 + commit,套用 + 跨帳號/RLS live 驗證延後(承 C1,待 Supabase 金鑰)。
- worktree 為 sibling `../superpowers_food_map-laneC2`(非 `.claude/worktrees`,避 next/jest 找不到測試)。git 若在 bash 報 `/mnt/d` 錯,改用原生 git(PowerShell)或先 `git status` 確認;不行則報 DONE_WITH_CONCERNS 列出改動檔。
- ⚠️ Windows Jest 原生 binding:若 `jest` 噴 binding 錯,本機補上(勿 commit)。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `supabase/migrations/0002_sharing.sql`(新) | invite_token 欄 + unique index、trip_members 表、is_trip_participant()、放寬 RLS、column grants、trip_members RLS |
| `lib/types.ts`(改) | 新增 `TripMember` |
| `app/actions/members.ts`(新) | joinTrip / getInviteLink / rotateInvite / listMembers / removeMember / leaveTrip |
| `app/join/[token]/page.tsx`(新) | 加入轉導頁(auth → joinTrip → redirect;無效 token 訊息) |
| `components/MembersPanel.tsx`(新,client) | 邀請連結 + 複製 + 重產 + 成員清單 + 移除/離開 |
| `app/itinerary/[tripId]/page.tsx`(改) | 讀 members + isOwner,掛 MembersPanel |

---

## Task 0(前置,非程式碼):承 C1 的外部設定

C2 的 `0002_sharing.sql` 需套用到 C1 的同一 Supabase 專案。live 驗證(套 migration、多帳號加入、跨成員 RLS、join e2e)延後至 C1 的 Supabase/OAuth 金鑰就緒。實作各 task 的**程式碼 + 單元測試**不需金鑰(mock supabase)。

---

## Task 1: migration `0002_sharing.sql`

**Files:**
- Create: `supabase/migrations/0002_sharing.sql`

**Interfaces:**
- Produces: `trips.invite_token`;`public.trip_members(trip_id,user_id,role,joined_at)`;`public.is_trip_participant(uuid) → boolean`;放寬的 trips RLS(participant select/update)+ column grants;trip_members RLS。

> CODE-FIRST:只寫檔 + commit。**不**套用到 Supabase、**不**做 live RLS 驗證(無金鑰,延後)。無單元測試(SQL 產物)。

- [ ] **Step 1: 撰寫 migration**

Create `supabase/migrations/0002_sharing.sql`:
```sql
-- Lane C / C2: sharing + membership

-- 1) trips.invite_token（可分享邀請 token；重產=撤銷舊連結）
alter table public.trips add column if not exists invite_token uuid;
create unique index if not exists trips_invite_token_idx
  on public.trips(invite_token) where invite_token is not null;

-- 2) trip_members（owner 不入表；本表僅非 owner 的 editor）
create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
create index if not exists trip_members_user_id_idx on public.trip_members(user_id);

-- 3) 參與者判定（security definer 避免 policy 遞迴）
create or replace function public.is_trip_participant(t uuid)
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.trips where id = t and owner_id = auth.uid())
      or exists(select 1 from public.trip_members where trip_id = t and user_id = auth.uid());
$$;

-- 4) 放寬 trips RLS：select/update 給 participant；delete 仍 owner-only（C1 owner_delete 不動）
drop policy if exists "owner_select" on public.trips;
drop policy if exists "owner_update" on public.trips;
create policy "participant_select" on public.trips
  for select using (public.is_trip_participant(id));
create policy "participant_update" on public.trips
  for update using (public.is_trip_participant(id))
  with check (public.is_trip_participant(id));

-- 5) 欄位級：authenticated 只能改 title/plan/updated_at；invite_token/owner_id 僅 service-role
revoke update on public.trips from authenticated;
grant  update (title, plan, updated_at) on public.trips to authenticated;

-- 6) trip_members RLS
alter table public.trip_members enable row level security;
create policy "participant_select_members" on public.trip_members
  for select using (public.is_trip_participant(trip_id));
create policy "self_or_owner_delete" on public.trip_members
  for delete using (
    user_id = auth.uid()
    or exists(select 1 from public.trips where id = trip_id and owner_id = auth.uid())
  );
-- 無 insert policy：加入一律走 joinTrip server action（admin client）
```

- [ ] **Step 2: Commit**（不套用）

```bash
git add supabase/migrations/0002_sharing.sql
git commit -m "feat(laneC-c2): sharing migration — invite_token, trip_members, is_trip_participant, relaxed RLS + column grants"
```

---

## Task 2: `TripMember` 型別 + 加入/邀請 actions(admin)

**Files:**
- Modify: `lib/types.ts`
- Create: `app/actions/members.ts`(本 task 先放 joinTrip / getInviteLink / rotateInvite)
- Test: `__tests__/members-invite-actions.test.ts`

**Interfaces:**
- Consumes: `@/lib/supabase/server` `createClient()`、`@/lib/supabase/admin` `createAdminClient()`。
- Produces:
```ts
interface TripMember { userId: string; name: string; avatarUrl: string | null; role: 'owner' | 'editor'; isSelf: boolean }
joinTrip(token: string): Promise<{ tripId: string }>
getInviteLink(tripId: string): Promise<{ token: string }>
rotateInvite(tripId: string): Promise<{ token: string }>
```

- [ ] **Step 1: 新增型別**

Edit `lib/types.ts`,檔末追加:
```ts
export interface TripMember {
  userId: string
  name: string
  avatarUrl: string | null
  role: 'owner' | 'editor'
  isSelf: boolean
}
```

- [ ] **Step 2: 寫失敗測試**

Create `__tests__/members-invite-actions.test.ts`:
```ts
// server client mock：只用來取 user
let currentUser: { id: string } | null = { id: 'u1' }
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: jest.fn(async () => ({ data: { user: currentUser } })) } }),
}))

// admin client mock：可鏈式 from().select().eq().single() 與 insert()/update().eq()
type Res = { data: unknown; error: unknown }
let adminBehaviour: {
  tripByToken?: Res
  tripById?: Res
  insert?: Res
  update?: Res
} = {}
function makeAdmin() {
  const single = jest.fn(async () => adminBehaviour.tripByToken ?? { data: null, error: null })
  const singleById = jest.fn(async () => adminBehaviour.tripById ?? { data: null, error: null })
  const insert = jest.fn(async () => adminBehaviour.insert ?? { data: null, error: null })
  const updateEq = jest.fn(async () => adminBehaviour.update ?? { data: null, error: null })
  const from = jest.fn((table: string) => ({
    select: (_cols: string) => ({
      eq: (col: string, _val: string) => ({
        single: col === 'invite_token' ? single : singleById,
      }),
    }),
    insert: (_row: unknown) => insert(),
    update: (_patch: unknown) => ({ eq: (_c: string, _v: string) => updateEq() }),
  }))
  return { client: { from, auth: { admin: {} } }, spies: { single, singleById, insert, updateEq } }
}
let admin: ReturnType<typeof makeAdmin>
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin.client }))

beforeEach(() => { currentUser = { id: 'u1' }; adminBehaviour = {}; admin = makeAdmin() })

describe('joinTrip', () => {
  it('throws NOT_AUTHENTICATED when logged out', async () => {
    currentUser = null
    const { joinTrip } = require('@/app/actions/members')
    await expect(joinTrip('tok')).rejects.toThrow('NOT_AUTHENTICATED')
  })
  it('throws INVALID_INVITE when token matches no trip', async () => {
    adminBehaviour.tripByToken = { data: null, error: { message: 'no rows' } }
    const { joinTrip } = require('@/app/actions/members')
    await expect(joinTrip('bad')).rejects.toThrow('INVALID_INVITE')
  })
  it('is a no-op returning tripId when caller is the owner', async () => {
    adminBehaviour.tripByToken = { data: { id: 't1', owner_id: 'u1' }, error: null }
    const { joinTrip } = require('@/app/actions/members')
    expect(await joinTrip('tok')).toEqual({ tripId: 't1' })
    expect(admin.spies.insert).not.toHaveBeenCalled()
  })
  it('inserts membership for a new member', async () => {
    adminBehaviour.tripByToken = { data: { id: 't1', owner_id: 'owner' }, error: null }
    adminBehaviour.insert = { data: null, error: null }
    const { joinTrip } = require('@/app/actions/members')
    expect(await joinTrip('tok')).toEqual({ tripId: 't1' })
    expect(admin.spies.insert).toHaveBeenCalled()
  })
  it('is idempotent on duplicate membership (unique violation 23505)', async () => {
    adminBehaviour.tripByToken = { data: { id: 't1', owner_id: 'owner' }, error: null }
    adminBehaviour.insert = { data: null, error: { code: '23505' } }
    const { joinTrip } = require('@/app/actions/members')
    expect(await joinTrip('tok')).toEqual({ tripId: 't1' })
  })
})

describe('getInviteLink', () => {
  it('throws NOT_OWNER when caller is not the owner', async () => {
    adminBehaviour.tripById = { data: { owner_id: 'someone', invite_token: null }, error: null }
    const { getInviteLink } = require('@/app/actions/members')
    await expect(getInviteLink('t1')).rejects.toThrow('NOT_OWNER')
  })
  it('returns the existing token without regenerating', async () => {
    adminBehaviour.tripById = { data: { owner_id: 'u1', invite_token: 'existing' }, error: null }
    const { getInviteLink } = require('@/app/actions/members')
    expect(await getInviteLink('t1')).toEqual({ token: 'existing' })
    expect(admin.spies.updateEq).not.toHaveBeenCalled()
  })
  it('generates + persists a token when none exists', async () => {
    adminBehaviour.tripById = { data: { owner_id: 'u1', invite_token: null }, error: null }
    adminBehaviour.update = { data: null, error: null }
    const { getInviteLink } = require('@/app/actions/members')
    const out = await getInviteLink('t1')
    expect(typeof out.token).toBe('string')
    expect(out.token.length).toBeGreaterThan(0)
    expect(admin.spies.updateEq).toHaveBeenCalled()
  })
})

describe('rotateInvite', () => {
  it('owner gets a fresh token persisted', async () => {
    adminBehaviour.tripById = { data: { owner_id: 'u1', invite_token: 'old' }, error: null }
    adminBehaviour.update = { data: null, error: null }
    const { rotateInvite } = require('@/app/actions/members')
    const out = await rotateInvite('t1')
    expect(out.token).not.toBe('old')
    expect(admin.spies.updateEq).toHaveBeenCalled()
  })
  it('throws NOT_OWNER for non-owner', async () => {
    adminBehaviour.tripById = { data: { owner_id: 'x', invite_token: 'old' }, error: null }
    const { rotateInvite } = require('@/app/actions/members')
    await expect(rotateInvite('t1')).rejects.toThrow('NOT_OWNER')
  })
})
```
> 若鏈式 mock 形狀對不上實作,**調整 mock**(目標是驗 action 行為),勿扭曲 action 去遷就 mock。

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx jest -- members-invite-actions`
Expected: FAIL(`Cannot find module '@/app/actions/members'`)。

- [ ] **Step 4: 實作 actions**

Create `app/actions/members.ts`:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function joinTrip(token: string): Promise<{ tripId: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const admin = createAdminClient()
  const { data: trip, error } = await admin
    .from('trips').select('id, owner_id').eq('invite_token', token).single()
  if (error || !trip) throw new Error('INVALID_INVITE')
  const t = trip as { id: string; owner_id: string }
  if (t.owner_id === user.id) return { tripId: t.id }
  const { error: insErr } = await admin
    .from('trip_members').insert({ trip_id: t.id, user_id: user.id, role: 'editor' })
  if (insErr && (insErr as { code?: string }).code !== '23505') {
    throw new Error('加入失敗，請稍後再試')
  }
  return { tripId: t.id }
}

async function requireOwner(tripId: string): Promise<{ ownerId: string; inviteToken: string | null; userId: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips').select('owner_id, invite_token').eq('id', tripId).single()
  if (error || !data) throw new Error('操作失敗，請稍後再試')
  const t = data as { owner_id: string; invite_token: string | null }
  if (t.owner_id !== user.id) throw new Error('NOT_OWNER')
  return { ownerId: t.owner_id, inviteToken: t.invite_token, userId: user.id }
}

export async function getInviteLink(tripId: string): Promise<{ token: string }> {
  const { inviteToken } = await requireOwner(tripId)
  if (inviteToken) return { token: inviteToken }
  const token = crypto.randomUUID()
  const admin = createAdminClient()
  const { error } = await admin.from('trips').update({ invite_token: token }).eq('id', tripId)
  if (error) throw new Error('操作失敗，請稍後再試')
  return { token }
}

export async function rotateInvite(tripId: string): Promise<{ token: string }> {
  await requireOwner(tripId)
  const token = crypto.randomUUID()
  const admin = createAdminClient()
  const { error } = await admin.from('trips').update({ invite_token: token }).eq('id', tripId)
  if (error) throw new Error('操作失敗，請稍後再試')
  return { token }
}
```
> `crypto.randomUUID()` 為 Node 18+ 全域,Next server 環境可用。測試環境(jsdom/node)亦具備。

- [ ] **Step 5: 跑測試確認通過**

Run: `npx jest -- members-invite-actions`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts app/actions/members.ts __tests__/members-invite-actions.test.ts
git commit -m "feat(laneC-c2): TripMember type + joinTrip/getInviteLink/rotateInvite (admin, idempotent, owner-verify)"
```

---

## Task 3: 成員清單 / 移除 / 離開 actions

**Files:**
- Modify: `app/actions/members.ts`(追加)
- Test: `__tests__/members-list-actions.test.ts`

**Interfaces:**
- Consumes: server `createClient()`(RLS 驗參與者)、admin `createAdminClient()`(補顯示名稱)。
- Produces:
```ts
listMembers(tripId: string): Promise<TripMember[]>          // 參與者可見；owner + members；非參與者回 []
removeMember(tripId: string, userId: string): Promise<void> // 靠 trip_members delete RLS（self-or-owner）
leaveTrip(tripId: string): Promise<void>                    // 刪自己那列
```

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/members-list-actions.test.ts`:
```ts
let currentUser: { id: string } | null = { id: 'u1' }
// server client：RLS 驗參與者（select trips 回 null=非參與者）+ trip_members delete
let serverTripVisible: { data: unknown; error: unknown } = { data: { id: 't1' }, error: null }
const deleteEq2 = jest.fn(async () => ({ error: null }))
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: currentUser } })) },
    from: (_t: string) => ({
      select: (_c: string) => ({ eq: (_col: string, _v: string) => ({ single: async () => serverTripVisible }) }),
      delete: () => ({ eq: (_c1: string, _v1: string) => ({ eq: (_c2: string, _v2: string) => deleteEq2() }) }),
    }),
  }),
}))

// admin：讀 owner_id、members、getUserById
let ownerRow: { data: unknown } = { data: { owner_id: 'u1' } }
let memberRows: { data: unknown } = { data: [{ user_id: 'u2', role: 'editor' }] }
const getUserById = jest.fn(async (id: string) => ({
  data: { user: { id, email: `${id}@x.com`, user_metadata: { name: `Name-${id}`, avatar_url: null } } },
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_t: string) => ({
      select: (_c: string) => ({
        eq: (_col: string, _v: string) => ({
          single: async () => ownerRow,
          then: (r: (x: unknown) => unknown) => Promise.resolve(memberRows).then(r), // eq(...) awaited directly
        }),
      }),
    }),
    auth: { admin: { getUserById: (id: string) => getUserById(id) } },
  }),
}))

beforeEach(() => {
  currentUser = { id: 'u1' }
  serverTripVisible = { data: { id: 't1' }, error: null }
  ownerRow = { data: { owner_id: 'u1' } }
  memberRows = { data: [{ user_id: 'u2', role: 'editor' }] }
  getUserById.mockClear(); deleteEq2.mockClear()
})

describe('listMembers', () => {
  it('returns [] for a non-participant (RLS hides the trip)', async () => {
    serverTripVisible = { data: null, error: { message: 'no rows' } }
    const { listMembers } = require('@/app/actions/members')
    expect(await listMembers('t1')).toEqual([])
  })
  it('returns owner + members with names and isSelf', async () => {
    const { listMembers } = require('@/app/actions/members')
    const out = await listMembers('t1')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ userId: 'u1', role: 'owner', isSelf: true, name: 'Name-u1' })
    expect(out[1]).toMatchObject({ userId: 'u2', role: 'editor', isSelf: false, name: 'Name-u2' })
  })
})

describe('removeMember / leaveTrip', () => {
  it('removeMember issues a delete on trip_members', async () => {
    const { removeMember } = require('@/app/actions/members')
    await removeMember('t1', 'u2')
    expect(deleteEq2).toHaveBeenCalled()
  })
  it('leaveTrip deletes the caller row', async () => {
    const { leaveTrip } = require('@/app/actions/members')
    await leaveTrip('t1')
    expect(deleteEq2).toHaveBeenCalled()
  })
})
```
> admin 的 members 查詢在實作為 `admin.from('trip_members').select('user_id, role').eq('trip_id', tripId)`(await 陣列)。若 mock 鏈形狀對不上,調整 mock(以驗行為為準)。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- members-list-actions`
Expected: FAIL(未匯出 `listMembers`)。

- [ ] **Step 3: 追加實作**

Append to `app/actions/members.ts`:
```ts
import type { TripMember } from '@/lib/types'

export async function listMembers(tripId: string): Promise<TripMember[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  // RLS 閘門：非參與者看不到該 trip → 回 []
  const { data: visible } = await supabase.from('trips').select('id').eq('id', tripId).single()
  if (!visible) return []

  const admin = createAdminClient()
  const { data: ownerData } = await admin.from('trips').select('owner_id').eq('id', tripId).single()
  const ownerId = (ownerData as { owner_id: string } | null)?.owner_id
  if (!ownerId) return []
  const { data: rows } = await admin.from('trip_members').select('user_id, role').eq('trip_id', tripId)
  const memberRows = (rows ?? []) as { user_id: string; role: string }[]

  const participants: { id: string; role: 'owner' | 'editor' }[] = [
    { id: ownerId, role: 'owner' },
    ...memberRows.map((r) => ({ id: r.user_id, role: 'editor' as const })),
  ]
  const out: TripMember[] = []
  for (const p of participants) {
    const { data } = await admin.auth.admin.getUserById(p.id)
    const u = data?.user
    const meta = (u?.user_metadata ?? {}) as { name?: string; full_name?: string; avatar_url?: string }
    out.push({
      userId: p.id,
      name: meta.name ?? meta.full_name ?? u?.email ?? '使用者',
      avatarUrl: meta.avatar_url ?? null,
      role: p.role,
      isSelf: p.id === user.id,
    })
  }
  return out
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', userId)
  if (error) throw new Error('移除失敗，請稍後再試')
}

export async function leaveTrip(tripId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { error } = await supabase.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', user.id)
  if (error) throw new Error('離開失敗，請稍後再試')
}
```
> `removeMember`/`leaveTrip` 的權限由 `trip_members` 的 `self_or_owner_delete` RLS 政策強制(owner 移除他人、成員移除自己);action 為薄包裝,不重複判斷。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest -- members-list-actions`
Expected: PASS(mock 形狀如需微調見 Step 1 註記)。

- [ ] **Step 5: Commit**

```bash
git add app/actions/members.ts __tests__/members-list-actions.test.ts
git commit -m "feat(laneC-c2): listMembers (RLS-gated + admin name resolve) + removeMember/leaveTrip"
```

---

## Task 4: `/join/[token]` 加入轉導頁

**Files:**
- Create: `app/join/[token]/page.tsx`
- Test: `__tests__/join-page.test.tsx`

**Interfaces:**
- Consumes: `@/lib/supabase/server` `createClient()`(取 user)、`@/app/actions/members` `joinTrip`;`next/navigation` `redirect`。
- Produces: server route,未登入 → `redirect('/login?next=/join/<token>')`;登入 → `joinTrip` → 成功 `redirect('/itinerary/<id>')`;`INVALID_INVITE` → 渲染錯誤訊息。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/join-page.test.tsx`:
```tsx
const getUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: () => getUser() } }) }))
const joinTrip = jest.fn()
jest.mock('@/app/actions/members', () => ({ joinTrip: (...a: unknown[]) => joinTrip(...a) }))
const redirect = jest.fn((url: string) => { throw new Error('REDIRECT:' + url) })
jest.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))

beforeEach(() => { getUser.mockReset(); joinTrip.mockReset(); redirect.mockClear() })

it('redirects to login (with next) when logged out', async () => {
  getUser.mockResolvedValue({ data: { user: null } })
  const JoinPage = require('@/app/join/[token]/page').default
  await expect(JoinPage({ params: { token: 'tok1' } })).rejects.toThrow('REDIRECT:/login?next=%2Fjoin%2Ftok1')
})

it('joins then redirects to the itinerary when logged in', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  joinTrip.mockResolvedValue({ tripId: 't1' })
  const JoinPage = require('@/app/join/[token]/page').default
  await expect(JoinPage({ params: { token: 'tok1' } })).rejects.toThrow('REDIRECT:/itinerary/t1')
  expect(joinTrip).toHaveBeenCalledWith('tok1')
})

it('renders an error message on INVALID_INVITE', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  joinTrip.mockRejectedValue(new Error('INVALID_INVITE'))
  const JoinPage = require('@/app/join/[token]/page').default
  const el = await JoinPage({ params: { token: 'bad' } })
  // element tree contains the zh-TW error text
  const json = JSON.stringify(el)
  expect(json).toContain('邀請連結無效或已失效')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- join-page`
Expected: FAIL(模組不存在)。

- [ ] **Step 3: 實作路由**

Create `app/join/[token]/page.tsx`:
```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { joinTrip } from '@/app/actions/members'

export default async function JoinPage({ params }: { params: { token: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${params.token}`)}`)
  }
  try {
    const { tripId } = await joinTrip(params.token)
    redirect(`/itinerary/${tripId}`)
  } catch (e) {
    if (e instanceof Error && e.message === 'INVALID_INVITE') {
      return (
        <main className="max-w-sm mx-auto px-4 py-16 text-center flex flex-col gap-4">
          <p className="text-gray-700">邀請連結無效或已失效</p>
          <Link href="/trips" className="text-sm underline">回我的行程</Link>
        </main>
      )
    }
    throw e
  }
}
```
> 注意:`redirect()` 內部以 throw 運作,故放在 try 內時,成功轉導的 throw 會被 catch 捕捉再重拋 —— 本實作在 catch 內僅處理 `INVALID_INVITE`,其餘(含 redirect 的 `NEXT_REDIRECT`)`throw e` 原樣拋出,行為正確。測試以 `REDIRECT:` 前綴模擬。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest -- join-page`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add "app/join/[token]/page.tsx" __tests__/join-page.test.tsx
git commit -m "feat(laneC-c2): /join/[token] route — auth redirect, joinTrip, invalid-invite message"
```

---

## Task 5: `MembersPanel` 元件

**Files:**
- Create: `components/MembersPanel.tsx`
- Test: `__tests__/members-panel.test.tsx`

**Interfaces:**
- Consumes: `@/app/actions/members` `getInviteLink`/`rotateInvite`/`removeMember`/`leaveTrip`;`@/lib/types` `TripMember`;`next/navigation` `useRouter`。
- Produces: `MembersPanel({ tripId, members, isOwner })`,`members: TripMember[]`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/members-panel.test.tsx`:
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
const getInviteLink = jest.fn(); const rotateInvite = jest.fn(); const removeMember = jest.fn(); const leaveTrip = jest.fn()
jest.mock('@/app/actions/members', () => ({
  getInviteLink: (...a: unknown[]) => getInviteLink(...a),
  rotateInvite: (...a: unknown[]) => rotateInvite(...a),
  removeMember: (...a: unknown[]) => removeMember(...a),
  leaveTrip: (...a: unknown[]) => leaveTrip(...a),
}))
const refresh = jest.fn(); const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }))
import { MembersPanel } from '@/components/MembersPanel'
import type { TripMember } from '@/lib/types'

const members: TripMember[] = [
  { userId: 'u1', name: '團主', avatarUrl: null, role: 'owner', isSelf: true },
  { userId: 'u2', name: '小明', avatarUrl: null, role: 'editor', isSelf: false },
]
beforeEach(() => { [getInviteLink, rotateInvite, removeMember, leaveTrip, refresh, push].forEach((f) => f.mockReset && f.mockReset()) })

it('owner: generate invite link shows the URL', async () => {
  getInviteLink.mockResolvedValue({ token: 'tok-123' })
  render(<MembersPanel tripId="t1" members={members} isOwner={true} />)
  fireEvent.click(screen.getByRole('button', { name: '產生邀請連結' }))
  await waitFor(() => expect(screen.getByDisplayValue(/\/join\/tok-123$/)).toBeInTheDocument())
})

it('owner: sees member list with a remove button for non-self members', () => {
  render(<MembersPanel tripId="t1" members={members} isOwner={true} />)
  expect(screen.getByText('小明')).toBeInTheDocument()
  // owner cannot remove self; can remove 小明
  expect(screen.getAllByRole('button', { name: '移除' })).toHaveLength(1)
})

it('member (non-owner): sees leave button, no invite controls', () => {
  const asMember = members.map((m) => ({ ...m, isSelf: m.userId === 'u2' }))
  render(<MembersPanel tripId="t1" members={asMember} isOwner={false} />)
  expect(screen.queryByRole('button', { name: '產生邀請連結' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '離開行程' })).toBeInTheDocument()
})

it('remove calls removeMember then refresh', async () => {
  removeMember.mockResolvedValue(undefined)
  render(<MembersPanel tripId="t1" members={members} isOwner={true} />)
  fireEvent.click(screen.getByRole('button', { name: '移除' }))
  await waitFor(() => expect(removeMember).toHaveBeenCalledWith('t1', 'u2'))
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- members-panel`
Expected: FAIL。

- [ ] **Step 3: 實作元件**

Create `components/MembersPanel.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TripMember } from '@/lib/types'
import { getInviteLink, rotateInvite, removeMember, leaveTrip } from '@/app/actions/members'

interface Props { tripId: string; members: TripMember[]; isOwner: boolean }

export function MembersPanel({ tripId, members, isOwner }: Props) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inviteUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${token}`
    : ''

  async function onGenerate() {
    setBusy(true)
    try { const { token: t } = await getInviteLink(tripId); setToken(t) } finally { setBusy(false) }
  }
  async function onRotate() {
    setBusy(true)
    try { const { token: t } = await rotateInvite(tripId); setToken(t) } finally { setBusy(false) }
  }
  async function onCopy() {
    if (inviteUrl) await navigator.clipboard.writeText(inviteUrl)
  }
  async function onRemove(userId: string) {
    setBusy(true)
    try { await removeMember(tripId, userId); router.refresh() } finally { setBusy(false) }
  }
  async function onLeave() {
    setBusy(true)
    try { await leaveTrip(tripId); router.push('/trips') } finally { setBusy(false) }
  }

  return (
    <section className="border rounded-md p-4 flex flex-col gap-3">
      <h2 className="font-medium">成員</h2>

      {isOwner && (
        <div className="flex flex-col gap-2">
          {token ? (
            <div className="flex items-center gap-2">
              <input readOnly value={inviteUrl} className="flex-1 border rounded px-2 py-1 text-sm" />
              <button onClick={onCopy} disabled={busy} className="text-sm border rounded px-2 py-1">複製連結</button>
              <button onClick={onRotate} disabled={busy} className="text-sm underline">重新產生連結</button>
            </div>
          ) : (
            <button onClick={onGenerate} disabled={busy} className="text-sm border rounded px-3 py-1 self-start">產生邀請連結</button>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between text-sm">
            <span>{m.name}{m.role === 'owner' ? '（團主）' : ''}{m.isSelf ? '（你）' : ''}</span>
            {isOwner && !m.isSelf && m.role !== 'owner' && (
              <button onClick={() => onRemove(m.userId)} disabled={busy} className="text-red-600 hover:underline">移除</button>
            )}
          </li>
        ))}
      </ul>

      {!isOwner && (
        <button onClick={onLeave} disabled={busy} className="text-red-600 hover:underline self-start">離開行程</button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest -- members-panel`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add components/MembersPanel.tsx __tests__/members-panel.test.tsx
git commit -m "feat(laneC-c2): MembersPanel — invite link/copy/rotate + member list + remove/leave"
```

---

## Task 6: 掛進 `/itinerary/[tripId]` 頁

**Files:**
- Modify: `app/itinerary/[tripId]/page.tsx`
- Test: `__tests__/trip-page-members.test.tsx`

**Interfaces:**
- Consumes: `@/app/actions/members` `listMembers`;`@/lib/supabase/server` `createClient()`(取 user 判 isOwner);`@/components/MembersPanel`;既有 `getTrip`。
- Produces: 頁面同時渲染 `MembersPanel`(members + isOwner)與既有 `ItineraryClient`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/trip-page-members.test.tsx`:
```tsx
const getTrip = jest.fn()
const listMembers = jest.fn()
jest.mock('@/app/actions/trips', () => ({ getTrip: (...a: unknown[]) => getTrip(...a) }))
jest.mock('@/app/actions/members', () => ({ listMembers: (...a: unknown[]) => listMembers(...a) }))
const getUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: () => getUser() } }) }))
jest.mock('next/navigation', () => ({ notFound: () => { throw new Error('NF') } }))
jest.mock('@/app/itinerary/ItineraryClient', () => ({ ItineraryClient: (p: { tripId?: string; initial?: unknown }) => null && p }))
jest.mock('@/components/MembersPanel', () => ({ MembersPanel: (p: { isOwner?: boolean }) => null && p }))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' }
beforeEach(() => { getTrip.mockReset(); listMembers.mockReset(); getUser.mockReset() })

it('passes isOwner=true when the current user owns the trip', async () => {
  getTrip.mockResolvedValue({ plan, title: 'T', ownerId: 'u1' })
  listMembers.mockResolvedValue([{ userId: 'u1', name: 'a', avatarUrl: null, role: 'owner', isSelf: true }])
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 't1' } })
  const json = JSON.stringify(el)
  expect(json).toContain('"isOwner":true')
})
```
> 註:此 task 需讓 `getTrip` 也回傳 `ownerId`(見 Step 3);對應 C1 的 `getTrip` 需擴充選取欄位。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- trip-page-members`
Expected: FAIL(目前頁面未渲染 MembersPanel / 未傳 isOwner)。

- [ ] **Step 3: 擴充 `getTrip` 回傳 ownerId,改寫頁面**

先在 `app/actions/trips.ts` 的 `getTrip` 選取加入 `owner_id` 並回傳 `ownerId`(additive,不影響既有呼叫端):
```ts
// getTrip：select('plan, title, owner_id')；回傳 { plan, title, ownerId }
export async function getTrip(tripId: string): Promise<{ plan: PlanResult; title: string; ownerId: string } | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trips').select('plan, title, owner_id').eq('id', tripId).single()
  if (error || !data) return null
  const row = data as { plan: PlanResult; title: string; owner_id: string }
  return { plan: row.plan, title: row.title, ownerId: row.owner_id }
}
```
> C1 既有 `getTrip` 呼叫端(`/itinerary/[tripId]` 舊版、trips-actions 測試)使用 `{ plan, title }`;新增 `ownerId` 為 additive,既有解構不受影響。若 C1 的 `trips-actions` 測試斷言 `getTrip` 的完整回傳物件相等,於本 task 一併更新該測試預期含 `ownerId`(mock 的 `single` data 加 `owner_id`)。

改寫 `app/itinerary/[tripId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getTrip } from '@/app/actions/trips'
import { listMembers } from '@/app/actions/members'
import { createClient } from '@/lib/supabase/server'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { MembersPanel } from '@/components/MembersPanel'

export default async function TripPage({ params }: { params: { tripId: string } }) {
  const trip = await getTrip(params.tripId)
  if (!trip) notFound()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = !!user && user.id === trip.ownerId
  const members = await listMembers(params.tripId)
  return (
    <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-4">
      <MembersPanel tripId={params.tripId} members={members} isOwner={isOwner} />
      <ItineraryClient initial={trip.plan} tripId={params.tripId} />
    </main>
  )
}
```

- [ ] **Step 4: 跑測試確認通過 + 迴歸**

Run: `npx jest -- trip-page-members` 然後 `npx jest -- trip-page trips-actions`
Expected: 新測試 PASS;既有 `trip-page` / `trips-actions` 測試綠(如 Step 3 更新了 getTrip 測試預期則一併綠)。

- [ ] **Step 5: Commit**

```bash
git add "app/itinerary/[tripId]/page.tsx" app/actions/trips.ts __tests__/trip-page-members.test.tsx __tests__/trips-actions.test.ts __tests__/trip-page.test.tsx
git commit -m "feat(laneC-c2): mount MembersPanel on trip page; getTrip returns ownerId"
```

---

## Task 7: 收尾 — Lane C roadmap 更新 + 全量 gate

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-laneC-roadmap.md`(C2 標記進行/完成)

- [ ] **Step 1: 更新 roadmap**

在 `docs/superpowers/specs/2026-07-01-laneC-roadmap.md` 把 C2 標為「本分支完成(code-first;live 驗證待金鑰)」,一行帶過交付(分享連結 + 成員 + RLS 放寬)。

- [ ] **Step 2: 全量 gate**

Run(依序):
```bash
npx jest && npm run lint && npm run build
```
Expected:全綠、無 type error、`next build` 成功。若 lint/build 揪出 C2 型別問題就地最小修;若為既有/無關則報 DONE_WITH_CONCERNS 附錯誤。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-01-laneC-roadmap.md
git commit -m "docs(laneC-c2): mark C2 complete on branch (code-first; live verify pending keys)"
```

---

## Self-Review(對照 spec)

**Spec coverage:**
- spec §2.1 migration(invite_token/trip_members/is_trip_participant)→ Task 1 ✅
- spec §2.3 放寬 RLS + 欄位級 grant + trip_members RLS → Task 1 ✅
- spec §3.2 joinTrip/getInviteLink/rotateInvite(admin、owner-verify、idempotent)→ Task 2 ✅
- spec §3.2 listMembers/removeMember/leaveTrip → Task 3 ✅(listMembers 先 RLS 閘門再 admin 補名,防非參與者列舉)
- spec §3.1 /join/[token] 流程 → Task 4 ✅
- spec §4.1 MembersPanel(邀請連結/複製/重產/清單/移除/離開)→ Task 5 ✅
- spec §4 掛進行程頁(members + isOwner)→ Task 6 ✅
- spec §2.4 RLS 放寬自動涵蓋 listTrips/saveTrip → 無需程式;Task 6 迴歸驗 C1 綠 ✅
- spec §7 測試(RLS/actions/整合/迴歸)→ 各 task 單元 + 迴歸;RLS live 驗證延後(code-first)

**Placeholder scan:** 無 TBD;所有 code step 含完整程式碼。Task 1 的 live 套用/RLS 驗證為 code-first 明確延後(非 TBD)。

**Type consistency:** `TripMember {userId,name,avatarUrl,role,isSelf}`、`joinTrip→{tripId}`、`getInviteLink/rotateInvite→{token}`、`listMembers→TripMember[]`、`getTrip→{plan,title,ownerId}`、`MembersPanel({tripId,members,isOwner})` 跨 task 一致。
