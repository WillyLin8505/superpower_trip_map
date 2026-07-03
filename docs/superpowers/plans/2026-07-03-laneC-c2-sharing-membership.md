# Lane C / C2 Sharing + Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trip owner create a share link so another signed-in Google/LINE user can join the same trip as an editor.

**Architecture:** This is stacked on C1 (`lane/c2-sharing` starts from `lane/c1-auth-persistence`). C2 adds `trips.invite_token`, a `trip_members` table, participant-aware RLS, a controlled `joinTrip()` server action that uses the admin client, a `/join/[token]` route, and a members panel on `/itinerary/[tripId]`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase Auth/Postgres/RLS, `@supabase/ssr`, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-03-laneC-c2-sharing-membership-design.md`

## Global Constraints

- TypeScript strict. Do not add production `any`; use typed mocks or `unknown` in tests.
- Keep C2 stacked on C1. Do not modify C1 PR history; commit only on `lane/c2-sharing`.
- Code-first mode: write migrations and tests locally, but live Supabase migration/RLS/OAuth verification remains deferred until Supabase keys exist.
- Only `joinTrip`, `getInviteLink`, and `rotateInvite` may use the admin client. All ordinary read/write access still goes through RLS.
- `trips.invite_token` and `trips.owner_id` must not be updateable by normal authenticated clients. Use column grants so authenticated clients may update only `title`, `plan`, and `updated_at`.
- C2 roles are only `owner` and `editor`. No viewer role, email invite, invite expiration, presence, or realtime collaboration in this plan.
- UI copy must remain Traditional Chinese where user-facing text is added.
- Use sibling worktree `D:\vibe_coding_project\food_map\superpowers_food_map-laneC2`. Prefer PowerShell/native git in this worktree if git path issues appear.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0002_sharing.sql` | Add invite token, `trip_members`, helper function, participant RLS, and column grants. |
| `lib/types.ts` | Add `TripMember`. |
| `app/actions/members.ts` | Join, invite-token management, member listing, remove/leave actions. |
| `app/join/[token]/page.tsx` | Login redirect, join flow, invalid invite message. |
| `components/MembersPanel.tsx` | Invite link UI, member list, remove/leave buttons. |
| `app/itinerary/[tripId]/page.tsx` | Mount `MembersPanel` above `ItineraryClient`. |
| `app/actions/trips.ts` | Add `ownerId` to `getTrip()` return. |
| `docs/superpowers/specs/2026-07-01-laneC-roadmap.md` | Mark C2 code complete with live verification pending. |

---

## Task 1: Sharing Migration

**Files:**
- Create: `supabase/migrations/0002_sharing.sql`

**Interfaces:**
- Produces `trips.invite_token`.
- Produces `public.trip_members(trip_id, user_id, role, joined_at)`.
- Produces `public.is_trip_participant(uuid): boolean`.
- Replaces C1 `trips` select/update policies with participant-aware policies.
- Keeps delete owner-only.

- [ ] **Step 1: Create migration**

Create `supabase/migrations/0002_sharing.sql` with exactly this SQL:

```sql
-- Lane C / C2: sharing + membership

alter table public.trips add column if not exists invite_token uuid;

create unique index if not exists trips_invite_token_idx
  on public.trips(invite_token)
  where invite_token is not null;

create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists trip_members_user_id_idx
  on public.trip_members(user_id);

create or replace function public.is_trip_participant(t uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.trips where id = t and owner_id = auth.uid()
  )
  or exists (
    select 1 from public.trip_members where trip_id = t and user_id = auth.uid()
  );
$$;

drop policy if exists "owner_select" on public.trips;
drop policy if exists "owner_update" on public.trips;

create policy "participant_select" on public.trips
  for select using (public.is_trip_participant(id));

create policy "participant_update" on public.trips
  for update using (public.is_trip_participant(id))
  with check (public.is_trip_participant(id));

revoke update on public.trips from authenticated;
grant update (title, plan, updated_at) on public.trips to authenticated;

alter table public.trip_members enable row level security;

create policy "participant_select_members" on public.trip_members
  for select using (public.is_trip_participant(trip_id));

create policy "self_or_owner_delete" on public.trip_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.trips
      where id = trip_id and owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add supabase/migrations/0002_sharing.sql
git commit -m "feat(laneC-c2): sharing migration"
```

---

## Task 2: Invite Actions

**Files:**
- Modify: `lib/types.ts`
- Create: `app/actions/members.ts`
- Test: `__tests__/members-invite-actions.test.ts`

**Interfaces:**
- Produces `TripMember`.
- Produces `joinTrip(token): Promise<{ tripId: string }>`
- Produces `getInviteLink(tripId): Promise<{ token: string }>`
- Produces `rotateInvite(tripId): Promise<{ token: string }>`

- [ ] **Step 1: Add `TripMember` type**

Append to `lib/types.ts`:

```ts
export interface TripMember {
  userId: string
  name: string
  avatarUrl: string | null
  role: 'owner' | 'editor'
  isSelf: boolean
}
```

- [ ] **Step 2: Write tests first**

Create `__tests__/members-invite-actions.test.ts` covering:

- `joinTrip()` throws `NOT_AUTHENTICATED` when logged out.
- `joinTrip()` throws `INVALID_INVITE` when token has no trip.
- `joinTrip()` returns `{ tripId }` and does not insert when caller is owner.
- `joinTrip()` inserts `{ trip_id, user_id, role: 'editor' }` for a new member.
- `joinTrip()` treats duplicate membership error code `23505` as success.
- `getInviteLink()` throws `NOT_OWNER` for non-owner.
- `getInviteLink()` returns existing token without update.
- `getInviteLink()` generates and persists a UUID when missing.
- `rotateInvite()` owner gets a new persisted token.
- `rotateInvite()` throws `NOT_OWNER` for non-owner.

Mock `@/lib/supabase/server` for `auth.getUser()` and `@/lib/supabase/admin` for `from('trips')`, `from('trip_members')`, `select`, `eq`, `single`, `insert`, and `update`. Keep mocks local to this test file.

- [ ] **Step 3: Verify red**

Run:

```powershell
npx jest -- members-invite-actions
```

Expected: FAIL because `@/app/actions/members` does not exist.

- [ ] **Step 4: Implement invite actions**

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
  const { data, error } = await admin
    .from('trips')
    .select('id, owner_id')
    .eq('invite_token', token)
    .single()

  if (error || !data) throw new Error('INVALID_INVITE')

  const trip = data as { id: string; owner_id: string }
  if (trip.owner_id === user.id) return { tripId: trip.id }

  const { error: insertError } = await admin
    .from('trip_members')
    .insert({ trip_id: trip.id, user_id: user.id, role: 'editor' })

  if (insertError && (insertError as { code?: string }).code !== '23505') {
    throw new Error('加入失敗，請稍後再試')
  }

  return { tripId: trip.id }
}

async function requireOwner(tripId: string): Promise<{ inviteToken: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .select('owner_id, invite_token')
    .eq('id', tripId)
    .single()

  if (error || !data) throw new Error('讀取失敗，請稍後再試')

  const trip = data as { owner_id: string; invite_token: string | null }
  if (trip.owner_id !== user.id) throw new Error('NOT_OWNER')

  return { inviteToken: trip.invite_token }
}

export async function getInviteLink(tripId: string): Promise<{ token: string }> {
  const { inviteToken } = await requireOwner(tripId)
  if (inviteToken) return { token: inviteToken }

  const token = crypto.randomUUID()
  const admin = createAdminClient()
  const { error } = await admin.from('trips').update({ invite_token: token }).eq('id', tripId)
  if (error) throw new Error('讀取失敗，請稍後再試')
  return { token }
}

export async function rotateInvite(tripId: string): Promise<{ token: string }> {
  await requireOwner(tripId)
  const token = crypto.randomUUID()
  const admin = createAdminClient()
  const { error } = await admin.from('trips').update({ invite_token: token }).eq('id', tripId)
  if (error) throw new Error('讀取失敗，請稍後再試')
  return { token }
}
```

- [ ] **Step 5: Verify green**

Run:

```powershell
npx jest -- members-invite-actions
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add lib/types.ts app/actions/members.ts __tests__/members-invite-actions.test.ts
git commit -m "feat(laneC-c2): invite actions"
```

---

## Task 3: Member Listing And Removal Actions

**Files:**
- Modify: `app/actions/members.ts`
- Test: `__tests__/members-list-actions.test.ts`

**Interfaces:**
- Produces `listMembers(tripId): Promise<TripMember[]>`
- Produces `removeMember(tripId, userId): Promise<void>`
- Produces `leaveTrip(tripId): Promise<void>`

- [ ] **Step 1: Write tests first**

Create `__tests__/members-list-actions.test.ts` covering:

- `listMembers()` returns `[]` when RLS hides the trip.
- `listMembers()` returns owner plus editors, resolves names from `auth.admin.getUserById()`, and marks `isSelf`.
- `removeMember()` deletes `trip_members` by `trip_id` and `user_id`.
- `leaveTrip()` deletes the current user's own row.
- `leaveTrip()` throws `NOT_AUTHENTICATED` when logged out.

- [ ] **Step 2: Verify red**

Run:

```powershell
npx jest -- members-list-actions
```

Expected: FAIL because exports are missing.

- [ ] **Step 3: Implement actions**

Append to `app/actions/members.ts`:

```ts
import type { TripMember } from '@/lib/types'

export async function listMembers(tripId: string): Promise<TripMember[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: visible } = await supabase.from('trips').select('id').eq('id', tripId).single()
  if (!visible) return []

  const admin = createAdminClient()
  const { data: ownerData } = await admin.from('trips').select('owner_id').eq('id', tripId).single()
  const ownerId = (ownerData as { owner_id: string } | null)?.owner_id
  if (!ownerId) return []

  const { data: rows } = await admin.from('trip_members').select('user_id, role').eq('trip_id', tripId)
  const memberRows = (rows ?? []) as { user_id: string; role: string }[]
  const participantIds = [ownerId, ...memberRows.map((row) => row.user_id)]

  const members: TripMember[] = []
  for (const id of participantIds) {
    const role: 'owner' | 'editor' = id === ownerId ? 'owner' : 'editor'
    const { data } = await admin.auth.admin.getUserById(id)
    const resolved = data?.user
    const metadata = (resolved?.user_metadata ?? {}) as {
      name?: string
      full_name?: string
      avatar_url?: string
    }
    members.push({
      userId: id,
      name: metadata.name ?? metadata.full_name ?? resolved?.email ?? '使用者',
      avatarUrl: metadata.avatar_url ?? null,
      role,
      isSelf: id === user.id,
    })
  }

  return members
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId)
  if (error) throw new Error('移除失敗，請稍後再試')
}

export async function leaveTrip(tripId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
  if (error) throw new Error('離開失敗，請稍後再試')
}
```

- [ ] **Step 4: Verify green**

Run:

```powershell
npx jest -- members-list-actions
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add app/actions/members.ts __tests__/members-list-actions.test.ts
git commit -m "feat(laneC-c2): member listing and removal actions"
```

---

## Task 4: Join Route

**Files:**
- Create: `app/join/[token]/page.tsx`
- Test: `__tests__/join-page.test.tsx`

**Interfaces:**
- Consumes `joinTrip(token)`.
- Consumes Supabase server client `auth.getUser()`.
- Produces `/join/[token]` server route.

- [ ] **Step 1: Write tests first**

Create `__tests__/join-page.test.tsx` covering:

- Logged-out user redirects to `/login?next=%2Fjoin%2F<token>`.
- Logged-in user calls `joinTrip(token)` and redirects to `/itinerary/<tripId>`.
- `INVALID_INVITE` renders `邀請連結無效或已失效`.

- [ ] **Step 2: Verify red**

Run:

```powershell
npx jest -- join-page
```

Expected: FAIL because route is missing.

- [ ] **Step 3: Implement route**

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
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_INVITE') {
      return (
        <main className="max-w-sm mx-auto px-4 py-16 text-center flex flex-col gap-4">
          <p className="text-gray-700">邀請連結無效或已失效</p>
          <Link href="/trips" className="text-sm underline">回到我的行程</Link>
        </main>
      )
    }
    throw error
  }
}
```

- [ ] **Step 4: Verify green**

Run:

```powershell
npx jest -- join-page
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add "app/join/[token]/page.tsx" __tests__/join-page.test.tsx
git commit -m "feat(laneC-c2): join route"
```

---

## Task 5: Members Panel

**Files:**
- Create: `components/MembersPanel.tsx`
- Test: `__tests__/members-panel.test.tsx`

**Interfaces:**
- Produces `MembersPanel({ tripId, members, isOwner })`.
- Consumes member actions from `app/actions/members.ts`.

- [ ] **Step 1: Write tests first**

Create `__tests__/members-panel.test.tsx` covering:

- Owner can generate an invite link and sees a `/join/<token>` URL.
- Owner sees the member list and a single `移除` button for non-self editor members.
- Non-owner member sees `離開行程` and no invite controls.
- `移除` calls `removeMember(tripId, userId)` and `router.refresh()`.
- `離開行程` calls `leaveTrip(tripId)` and `router.push('/trips')`.

- [ ] **Step 2: Verify red**

Run:

```powershell
npx jest -- members-panel
```

Expected: FAIL because component is missing.

- [ ] **Step 3: Implement component**

Create `components/MembersPanel.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TripMember } from '@/lib/types'
import { getInviteLink, leaveTrip, removeMember, rotateInvite } from '@/app/actions/members'

interface Props {
  tripId: string
  members: TripMember[]
  isOwner: boolean
}

export function MembersPanel({ tripId, members, isOwner }: Props) {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inviteUrl = token && typeof window !== 'undefined' ? `${window.location.origin}/join/${token}` : ''

  async function onGenerate() {
    setBusy(true)
    try {
      const out = await getInviteLink(tripId)
      setToken(out.token)
    } finally {
      setBusy(false)
    }
  }

  async function onRotate() {
    setBusy(true)
    try {
      const out = await rotateInvite(tripId)
      setToken(out.token)
    } finally {
      setBusy(false)
    }
  }

  async function onCopy() {
    if (inviteUrl) await navigator.clipboard.writeText(inviteUrl)
  }

  async function onRemove(userId: string) {
    setBusy(true)
    try {
      await removeMember(tripId, userId)
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function onLeave() {
    setBusy(true)
    try {
      await leaveTrip(tripId)
      router.push('/trips')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border rounded-md p-4 flex flex-col gap-3">
      <h2 className="font-medium">成員</h2>
      {isOwner && (
        <div className="flex flex-col gap-2">
          {token ? (
            <div className="flex items-center gap-2">
              <input readOnly value={inviteUrl} className="flex-1 border rounded px-2 py-1 text-sm" />
              <button type="button" onClick={onCopy} disabled={busy} className="text-sm border rounded px-2 py-1">複製連結</button>
              <button type="button" onClick={onRotate} disabled={busy} className="text-sm underline">重新產生連結</button>
            </div>
          ) : (
            <button type="button" onClick={onGenerate} disabled={busy} className="text-sm border rounded px-3 py-1 self-start">產生邀請連結</button>
          )}
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {members.map((member) => (
          <li key={member.userId} className="flex items-center justify-between text-sm">
            <span>
              {member.name}{member.role === 'owner' ? '（擁有者）' : ''}{member.isSelf ? '（你）' : ''}
            </span>
            {isOwner && !member.isSelf && member.role !== 'owner' && (
              <button type="button" onClick={() => onRemove(member.userId)} disabled={busy} className="text-red-600 hover:underline">移除</button>
            )}
          </li>
        ))}
      </ul>
      {!isOwner && (
        <button type="button" onClick={onLeave} disabled={busy} className="text-red-600 hover:underline self-start">離開行程</button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Verify green**

Run:

```powershell
npx jest -- members-panel
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add components/MembersPanel.tsx __tests__/members-panel.test.tsx
git commit -m "feat(laneC-c2): members panel"
```

---

## Task 6: Mount Members Panel On Trip Page

**Files:**
- Modify: `app/actions/trips.ts`
- Modify: `app/itinerary/[tripId]/page.tsx`
- Test: `__tests__/trip-page-members.test.tsx`
- Update if needed: `__tests__/trip-page.test.tsx`, `__tests__/trips-actions.test.ts`

**Interfaces:**
- `getTrip(tripId)` returns `{ plan, title, ownerId } | null`.
- Trip page renders `MembersPanel` with `members` and `isOwner`.

- [ ] **Step 1: Write tests first**

Create `__tests__/trip-page-members.test.tsx` covering:

- When `getTrip()` returns `ownerId` equal to the current user, the rendered element tree contains `MembersPanel` props with `isOwner: true`.
- When current user differs from `ownerId`, `isOwner: false`.
- `listMembers(tripId)` is called with the trip id.

- [ ] **Step 2: Verify red**

Run:

```powershell
npx jest -- trip-page-members
```

Expected: FAIL because trip page does not mount `MembersPanel`.

- [ ] **Step 3: Update `getTrip()`**

In `app/actions/trips.ts`, change `getTrip()` to select `plan, title, owner_id` and return `ownerId`:

```ts
export async function getTrip(tripId: string): Promise<{ plan: PlanResult; title: string; ownerId: string } | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trips')
    .select('plan, title, owner_id')
    .eq('id', tripId)
    .single()
  if (error || !data) return null
  const row = data as { plan: PlanResult; title: string; owner_id: string }
  return { plan: row.plan, title: row.title, ownerId: row.owner_id }
}
```

Update existing tests that mock or assert `getTrip()` to include `owner_id`/`ownerId`.

- [ ] **Step 4: Update trip page**

In `app/itinerary/[tripId]/page.tsx`, import `createClient`, `listMembers`, and `MembersPanel`; compute `isOwner` from the current user and `trip.ownerId`; render `MembersPanel` before `ItineraryClient`.

- [ ] **Step 5: Verify green**

Run:

```powershell
npx jest -- trip-page-members trip-page trips-actions
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add "app/itinerary/[tripId]/page.tsx" app/actions/trips.ts __tests__/trip-page-members.test.tsx __tests__/trip-page.test.tsx __tests__/trips-actions.test.ts
git commit -m "feat(laneC-c2): mount members panel on trip page"
```

---

## Task 7: Roadmap And Full Gate

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-laneC-roadmap.md`

- [ ] **Step 1: Update roadmap**

Update `docs/superpowers/specs/2026-07-01-laneC-roadmap.md` so C2 is marked as code-complete on `lane/c2-sharing`, with live verification pending Supabase/OAuth keys.

- [ ] **Step 2: Run full gate**

Run:

```powershell
npx jest
npm run lint
npm run build
```

Expected: all pass. If `next build` shows only the known Supabase Edge warning from C1, report it as non-blocking.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs/superpowers/specs/2026-07-01-laneC-roadmap.md
git commit -m "docs(laneC-c2): record C2 code-complete status"
```

---

## Self-Review

Spec coverage:
- Migration, helper function, RLS, and column grants are Task 1.
- Join/invite-token actions are Task 2.
- Member list/remove/leave actions are Task 3.
- Join route is Task 4.
- Member UI is Task 5.
- Trip page integration and `getTrip().ownerId` are Task 6.
- Roadmap and full gates are Task 7.

Known deferred work:
- Live Supabase migration/RLS verification.
- Real Google/LINE OAuth join flow.
- E2E with injected Supabase session.
