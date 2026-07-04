# Lane C / C2 Sharing + Membership Design Spec

**Date:** 2026-07-03
**Lane:** C, collaborative group travel
**Sub-project:** C2, sharing + membership
**Depends on:** C1 auth + persistence (`trips`, owner-only RLS, Supabase Auth, `/itinerary/[tripId]`)
**Status:** Design accepted; implementation plan written

---

## 1. Goal

C1 lets a signed-in owner save and reopen their own trip. C2 adds the first collaborative capability: an owner can create a share link, another signed-in user can open it, authenticate with Google or LINE, and become an editor on the same trip.

The feature is intentionally small:

- Use a share link, not email invitations.
- Use only `owner` and `editor`.
- Joined members can edit the itinerary through the same C1 autosave path.
- Owners can remove members and rotate the invite token.
- No realtime presence, viewer role, voting, candidate pool, or expense splitting.

---

## 2. Data Model

### 2.1 `trips.invite_token`

`trips` gets a nullable UUID invite token:

```sql
alter table public.trips add column if not exists invite_token uuid;
create unique index if not exists trips_invite_token_idx
  on public.trips(invite_token)
  where invite_token is not null;
```

The token is generated on first share. Rotating the token invalidates the old link.

### 2.2 `trip_members`

Owners remain represented by `trips.owner_id`; they are not duplicated in `trip_members`.

```sql
create table if not exists public.trip_members (
  trip_id   uuid not null references public.trips(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);
```

C2 stores only `editor` member rows. The `role` column is included for forward compatibility but no viewer behavior exists in C2.

### 2.3 Participant Helper

Policies need a single definition of participant:

```sql
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
```

`security definer` avoids recursive policy problems when policies query `trip_members`.

---

## 3. RLS And Grants

### 3.1 `trips`

Replace C1 owner-only `select` and `update` with participant-aware policies:

- `select`: owner or member.
- `update`: owner or member.
- `insert`: owner-only, unchanged from C1.
- `delete`: owner-only, unchanged from C1.

### 3.2 Column Grants

Row-level `update` alone is not enough. A member who can update a trip row must not be able to mutate `owner_id` or `invite_token` directly through the Supabase client.

C2 must revoke broad update and grant only:

```sql
revoke update on public.trips from authenticated;
grant update (title, plan, updated_at) on public.trips to authenticated;
```

`invite_token` updates are performed only through owner-verified server actions using the service-role admin client.

### 3.3 `trip_members`

Policies:

- participants can list members of their trip.
- a member can remove their own row.
- the trip owner can remove any member row.
- no public insert policy; joining is done only through the controlled `joinTrip()` action.

---

## 4. Server Actions

Create `app/actions/members.ts`.

```ts
joinTrip(token: string): Promise<{ tripId: string }>
getInviteLink(tripId: string): Promise<{ token: string }>
rotateInvite(tripId: string): Promise<{ token: string }>
listMembers(tripId: string): Promise<TripMember[]>
removeMember(tripId: string, userId: string): Promise<void>
leaveTrip(tripId: string): Promise<void>
```

`joinTrip`, `getInviteLink`, and `rotateInvite` use the admin client:

- `joinTrip` needs to look up a trip by invite token and insert a row without a general insert policy.
- `getInviteLink` and `rotateInvite` need to update `trips.invite_token`, which normal authenticated users cannot update by column grant.

All three must first use the normal server client to identify the current user. `getInviteLink` and `rotateInvite` must verify `trips.owner_id === user.id` before any token mutation.

`listMembers` first verifies RLS visibility using the normal server client, then uses the admin client to resolve owner/member metadata for display.

`removeMember` and `leaveTrip` use the normal server client and rely on `trip_members` RLS.

---

## 5. User Flow

### 5.1 Owner Invites

On `/itinerary/[tripId]`, the owner sees a members panel. The owner can:

- generate an invite link,
- copy it,
- rotate it,
- see members,
- remove non-owner members.

### 5.2 Member Joins

The owner sends `/join/<token>` in a chat group.

When a user opens it:

- if logged out, redirect to `/login?next=/join/<token>`.
- after Google/LINE login, return to `/join/<token>`.
- call `joinTrip(token)`.
- redirect to `/itinerary/<tripId>`.

Invalid or rotated tokens show `邀請連結無效或已失效`.

### 5.3 Member Edits

After joining, C1 actions automatically work for the member because `trips` select/update policies now allow participants. `listTrips()` also automatically includes joined trips through RLS.

The write model remains last-write-wins. Realtime presence and conflict handling remain C5.

---

## 6. Types

Add:

```ts
export interface TripMember {
  userId: string
  name: string
  avatarUrl: string | null
  role: 'owner' | 'editor'
  isSelf: boolean
}
```

Update `getTrip()` to return `ownerId` in addition to `plan` and `title` so the trip page can decide whether to show owner controls.

---

## 7. Tests

Unit tests:

- invite actions: logged-out, invalid token, owner no-op, member insert, duplicate idempotency, owner-only token generation/rotation.
- member actions: RLS-hidden trip returns `[]`, owner plus editors resolve names, remove member, leave trip.
- join route: logged-out redirect, logged-in redirect, invalid token message.
- members panel: owner controls, member controls, remove, leave.
- trip page: passes `members` and `isOwner`.

Integration gates:

- existing C1 save/autosave tests must remain green.
- full `npx jest`, `npm run lint`, and `npm run build`.

Live verification remains pending Supabase keys:

- apply `0002_sharing.sql`.
- verify owner/member/non-member RLS.
- perform real Google/LINE join flow.
- enable Playwright e2e with injected Supabase session.
