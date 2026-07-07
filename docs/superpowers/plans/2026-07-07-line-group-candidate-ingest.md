# LINE Group Candidate Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a LINE Messaging API webhook that lets a bound LINE group send Google Maps links, article URLs, or place names into an itinerary candidate pool.

**Architecture:** Add one schema migration for LINE group bindings, ingest jobs, and candidate source metadata. Keep webhook concerns split from parsing, binding lookup, candidate writing, and ingest processing. Reuse existing `searchPlace`, `scrapeText`, `extractItinerary`, and C3 `trip_candidates` semantics, with LINE writes using `write_as_user_id = trips.owner_id`.

**Tech Stack:** Next.js 14 App Router, TypeScript strict mode, Supabase Postgres/RLS/admin client, Jest, LINE Messaging API over `fetch`, existing Google Places and Claude extraction actions.

## Global Constraints

- One LINE group can have exactly one active trip binding.
- Unbound groups do not receive bot replies for normal non-command messages.
- Group members are treated as participants; MVP does not map LINE users to Supabase users.
- Candidate writes from LINE use `write_as_user_id` as `trip_candidates.added_by`.
- Supported inputs are Google Maps URLs, general article URLs, and plain text place names.
- LINE secrets stay server-only: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`.
- No new auth framework, queue service, or LINE account-linking system.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0004_line_group_candidate_ingest.sql` | Add `trip_candidates.source`, `trip_line_groups`, and `line_ingest_jobs`. |
| `lib/types.ts` | Add `LineCandidateSource`, `CandidateSource`, `Candidate.source?`, and LINE job/binding types used by app code. |
| `lib/line/signature.ts` | Verify LINE webhook signatures from raw request body. |
| `lib/line/parser.ts` | Parse LINE text commands and classify message text into maps URL, article URL, plain text, or ignored. |
| `lib/line/client.ts` | Server-only LINE reply/profile helpers. |
| `lib/line/bindings.ts` | Resolve trip links and manage one-active-binding-per-group. |
| `app/actions/candidates.ts` | Add source-aware `listCandidates` and server-only `addCandidateFromLine`. |
| `components/CandidatePanel.tsx` | Display LINE source text when a candidate came from LINE. |
| `lib/line/ingest.ts` | Convert a bound LINE message into candidates using existing search/scrape/extract functions. |
| `lib/line/jobs.ts` | Store incoming LINE message jobs and mark processing outcomes. |
| `app/api/line/webhook/route.ts` | Validate webhook, handle commands, enqueue/process messages, and reply. |
| `__tests__/*.test.ts` / `__tests__/*.test.tsx` | Focused unit and route tests for every boundary. |

---

### Task 1: Schema And Types

**Files:**
- Create: `supabase/migrations/0004_line_group_candidate_ingest.sql`
- Modify: `lib/types.ts`
- Test: `__tests__/line-types.test.ts`

**Interfaces:**
- Produces: `LineCandidateSource`, `CandidateSource`, `LineGroupBinding`, `LineIngestJob`, `Candidate.source?: CandidateSource`
- Later tasks consume `CandidateSource` in `app/actions/candidates.ts` and `components/CandidatePanel.tsx`.

- [ ] **Step 1: Write the failing type test**

Create `__tests__/line-types.test.ts`:

```ts
import type { Candidate, LineCandidateSource, LineGroupBinding, LineIngestJob, Place } from '@/lib/types'

const place: Place = {
  id: 'local-1',
  placeId: 'google-place-1',
  name: '台北101',
  type: 'attraction',
  lat: 25.033,
  lng: 121.5654,
  address: '台北市信義區',
  openingHours: null,
  rating: 4.7,
  photoUrl: null,
  description: null,
}

it('allows candidates to carry LINE source metadata', () => {
  const source: LineCandidateSource = {
    kind: 'line_group',
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '小明',
    messageId: 'm1',
    messageText: '台北101',
    sourceUrl: 'https://maps.app.goo.gl/example',
  }

  const candidate: Candidate = {
    id: 'c1',
    place,
    addedBy: 'owner-1',
    addedByName: 'Owner',
    source,
  }

  const binding: LineGroupBinding = {
    lineGroupId: 'Cg123',
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  }

  const job: LineIngestJob = {
    id: 'j1',
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm1',
    messageText: '台北101',
    status: 'queued',
  }

  expect(candidate.source?.kind).toBe('line_group')
  expect(binding.writeAsUserId).toBe('owner-1')
  expect(job.status).toBe('queued')
})
```

- [ ] **Step 2: Run the type test to verify it fails**

Run: `npx jest -- line-types`

Expected: FAIL with TypeScript errors that `LineCandidateSource`, `LineGroupBinding`, and `LineIngestJob` are not exported from `@/lib/types`.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/0004_line_group_candidate_ingest.sql`:

```sql
-- Lane C / C5: LINE group candidate ingest

alter table public.trip_candidates
  add column if not exists source jsonb;

create table if not exists public.trip_line_groups (
  id uuid primary key default gen_random_uuid(),
  line_group_id text not null,
  trip_id uuid not null references public.trips(id) on delete cascade,
  write_as_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create unique index if not exists trip_line_groups_active_group_idx
  on public.trip_line_groups(line_group_id)
  where status = 'active';

create index if not exists trip_line_groups_trip_id_idx
  on public.trip_line_groups(trip_id);

alter table public.trip_line_groups enable row level security;

create policy "participant_select_line_groups" on public.trip_line_groups
  for select using (public.is_trip_participant(trip_id));

create table if not exists public.line_ingest_jobs (
  id uuid primary key default gen_random_uuid(),
  line_group_id text,
  line_user_id text,
  message_id text not null,
  message_text text,
  event_payload jsonb not null,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create unique index if not exists line_ingest_jobs_message_id_idx
  on public.line_ingest_jobs(message_id);
```

- [ ] **Step 4: Add the TypeScript types**

In `lib/types.ts`, add below `TripMember` and update `Candidate`:

```ts
export interface LineCandidateSource {
  kind: 'line_group'
  lineGroupId: string
  lineUserId?: string
  lineDisplayName?: string
  messageId: string
  messageText?: string
  sourceUrl?: string
}

export type CandidateSource = LineCandidateSource

export interface LineGroupBinding {
  lineGroupId: string
  tripId: string
  writeAsUserId: string
}

export type LineIngestJobStatus = 'queued' | 'processing' | 'done' | 'ignored' | 'failed'

export interface LineIngestJob {
  id: string
  lineGroupId: string | null
  lineUserId: string | null
  messageId: string
  messageText: string | null
  status: LineIngestJobStatus
}
```

Replace the existing `Candidate` interface with:

```ts
export interface Candidate {
  id: string
  place: Place
  addedBy: string
  addedByName: string
  source?: CandidateSource
}
```

- [ ] **Step 5: Run the type test to verify it passes**

Run: `npx jest -- line-types`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts supabase/migrations/0004_line_group_candidate_ingest.sql __tests__/line-types.test.ts
git commit -m "feat(laneC-line): add line ingest schema and types"
```

---

### Task 2: LINE Signature And Message Parser

**Files:**
- Create: `lib/line/signature.ts`
- Create: `lib/line/parser.ts`
- Test: `__tests__/line-signature.test.ts`
- Test: `__tests__/line-parser.test.ts`

**Interfaces:**
- Produces: `verifyLineSignature(body, signature, secret): Promise<boolean>`
- Produces: `parseLineText(text): LineParsedText`
- Later tasks consume these from webhook route and ingest processor.

- [ ] **Step 1: Write the failing signature tests**

Create `__tests__/line-signature.test.ts`:

```ts
import { createHmac } from 'crypto'
import { verifyLineSignature } from '@/lib/line/signature'

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64')
}

it('accepts a valid LINE signature', async () => {
  const body = '{"events":[]}'
  const secret = 'line-secret'
  await expect(verifyLineSignature(body, sign(body, secret), secret)).resolves.toBe(true)
})

it('rejects an invalid LINE signature', async () => {
  await expect(verifyLineSignature('{"events":[]}', 'bad-signature', 'line-secret')).resolves.toBe(false)
})

it('rejects missing signature or secret', async () => {
  await expect(verifyLineSignature('body', null, 'line-secret')).resolves.toBe(false)
  await expect(verifyLineSignature('body', 'signature', '')).resolves.toBe(false)
})
```

- [ ] **Step 2: Write the failing parser tests**

Create `__tests__/line-parser.test.ts`:

```ts
import { parseLineText } from '@/lib/line/parser'

it('parses bind command with a trip link', () => {
  expect(parseLineText('/綁定 https://example.com/join/token-1')).toEqual({
    kind: 'bind',
    tripLinkOrToken: 'https://example.com/join/token-1',
  })
})

it('parses unbind command', () => {
  expect(parseLineText('/解除綁定')).toEqual({ kind: 'unbind' })
})

it('classifies Google Maps URLs', () => {
  expect(parseLineText('這個如何 https://maps.app.goo.gl/abc')).toEqual({
    kind: 'google_maps_url',
    url: 'https://maps.app.goo.gl/abc',
  })
})

it('classifies general article URLs', () => {
  expect(parseLineText('https://travel.example.com/taipei')).toEqual({
    kind: 'article_url',
    url: 'https://travel.example.com/taipei',
  })
})

it('classifies place text and ignores very short text', () => {
  expect(parseLineText('九份老街')).toEqual({ kind: 'place_text', query: '九份老街' })
  expect(parseLineText('ok')).toEqual({ kind: 'ignored' })
})

it('returns malformed bind when command has no target', () => {
  expect(parseLineText('/綁定')).toEqual({ kind: 'malformed_bind' })
})
```

- [ ] **Step 3: Run parser tests to verify they fail**

Run: `npx jest -- line-signature line-parser`

Expected: FAIL because `@/lib/line/signature` and `@/lib/line/parser` do not exist.

- [ ] **Step 4: Implement signature verification**

Create `lib/line/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from 'crypto'

export async function verifyLineSignature(
  body: string,
  signature: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!signature || !secret) return false

  const expected = createHmac('sha256', secret).update(body).digest('base64')
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}
```

- [ ] **Step 5: Implement parser**

Create `lib/line/parser.ts`:

```ts
export type LineParsedText =
  | { kind: 'bind'; tripLinkOrToken: string }
  | { kind: 'malformed_bind' }
  | { kind: 'unbind' }
  | { kind: 'google_maps_url'; url: string }
  | { kind: 'article_url'; url: string }
  | { kind: 'place_text'; query: string }
  | { kind: 'ignored' }

const GOOGLE_MAPS_HOSTS = new Set(['maps.app.goo.gl', 'www.google.com', 'google.com', 'goo.gl'])

export function parseLineText(text: string | null | undefined): LineParsedText {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return { kind: 'ignored' }

  if (trimmed === '/解除綁定') return { kind: 'unbind' }

  if (trimmed.startsWith('/綁定')) {
    const tripLinkOrToken = trimmed.slice('/綁定'.length).trim()
    return tripLinkOrToken ? { kind: 'bind', tripLinkOrToken } : { kind: 'malformed_bind' }
  }

  const url = extractFirstUrl(trimmed)
  if (url) {
    return isGoogleMapsUrl(url)
      ? { kind: 'google_maps_url', url }
      : { kind: 'article_url', url }
  }

  if (trimmed.length < 3) return { kind: 'ignored' }
  return { kind: 'place_text', query: trimmed }
}

function extractFirstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s]+/)?.[0] ?? null
}

function isGoogleMapsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (GOOGLE_MAPS_HOSTS.has(parsed.hostname)) {
      return parsed.hostname.includes('maps') || parsed.pathname.includes('/maps')
    }
    return false
  } catch {
    return false
  }
}
```

- [ ] **Step 6: Run tests**

Run: `npx jest -- line-signature line-parser`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/line/signature.ts lib/line/parser.ts __tests__/line-signature.test.ts __tests__/line-parser.test.ts
git commit -m "feat(laneC-line): verify signatures and parse messages"
```

---

### Task 3: LINE Binding Service

**Files:**
- Create: `lib/line/bindings.ts`
- Test: `__tests__/line-bindings.test.ts`

**Interfaces:**
- Consumes: Supabase admin client, `trips.id`, `trips.invite_token`, `trips.owner_id`
- Produces:
  - `bindLineGroupToTrip({ lineGroupId, tripLinkOrToken }): Promise<{ tripId: string }>`
  - `unbindLineGroup({ lineGroupId }): Promise<void>`
  - `getActiveLineGroupBinding(lineGroupId): Promise<LineGroupBinding | null>`

- [ ] **Step 1: Write failing binding service tests**

Create `__tests__/line-bindings.test.ts`:

```ts
type TripRow = { id: string; owner_id: string; invite_token: string | null }
type GroupRow = { line_group_id: string; trip_id: string; write_as_user_id: string; status: string }

let trips: TripRow[]
let groups: GroupRow[]
let lastUpdate: Record<string, unknown> | null
let lastInsert: Record<string, unknown> | null

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'trips') return makeTripsBuilder()
      if (table === 'trip_line_groups') return makeGroupsBuilder()
      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

function makeTripsBuilder() {
  return {
    select: () => ({
      eq: (column: string, value: string) => ({
        single: async () => {
          const row = trips.find((trip) => String(trip[column as keyof TripRow]) === value)
          return { data: row ?? null, error: row ? null : { message: 'not found' } }
        },
      }),
    }),
  }
}

function makeGroupsBuilder() {
  return {
    select: () => ({
      eq: (column: string, value: string) => ({
        eq: (_column2: string, value2: string) => ({
          maybeSingle: async () => {
            const row = groups.find((group) => group.line_group_id === value && group.status === value2)
            return { data: row ?? null, error: null }
          },
        }),
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      lastUpdate = payload
      return {
        eq: (column: string, value: string) => ({
          eq: (_column2: string, value2: string) => {
            groups = groups.map((group) =>
              group.line_group_id === value && group.status === value2
                ? { ...group, status: String(payload.status) }
                : group,
            )
            return { select: async () => ({ data: [{ line_group_id: value }], error: null }) }
          },
        }),
      }
    },
    insert: (payload: Record<string, unknown>) => {
      lastInsert = payload
      groups.push({
        line_group_id: String(payload.line_group_id),
        trip_id: String(payload.trip_id),
        write_as_user_id: String(payload.write_as_user_id),
        status: String(payload.status ?? 'active'),
      })
      return { select: () => ({ single: async () => ({ data: { id: 'binding-1' }, error: null }) }) }
    },
  }
}

beforeEach(() => {
  jest.resetModules()
  trips = [{ id: 'trip-1', owner_id: 'owner-1', invite_token: 'token-1' }]
  groups = []
  lastUpdate = null
  lastInsert = null
})

it('binds a LINE group from a join link token', async () => {
  const { bindLineGroupToTrip } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(bindLineGroupToTrip({
    lineGroupId: 'Cg123',
    tripLinkOrToken: 'https://app.example.com/join/token-1',
  })).resolves.toEqual({ tripId: 'trip-1' })

  expect(lastInsert).toEqual({
    line_group_id: 'Cg123',
    trip_id: 'trip-1',
    write_as_user_id: 'owner-1',
    status: 'active',
  })
})

it('disables an active binding', async () => {
  groups = [{ line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' }]
  const { unbindLineGroup } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(unbindLineGroup({ lineGroupId: 'Cg123' })).resolves.toBeUndefined()
  expect(lastUpdate).toEqual({ status: 'disabled' })
})

it('returns the active binding or null', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(getActiveLineGroupBinding('Cg123')).resolves.toBeNull()

  groups = [{ line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' }]
  await expect(getActiveLineGroupBinding('Cg123')).resolves.toEqual({
    lineGroupId: 'Cg123',
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
})
```

- [ ] **Step 2: Run binding tests to verify they fail**

Run: `npx jest -- line-bindings`

Expected: FAIL because `@/lib/line/bindings` does not exist.

- [ ] **Step 3: Implement binding service**

Create `lib/line/bindings.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LineGroupBinding } from '@/lib/types'

type TripRow = { id: string; owner_id: string; invite_token: string | null }
type BindingRow = { line_group_id: string; trip_id: string; write_as_user_id: string; status: string }

export async function bindLineGroupToTrip(input: {
  lineGroupId: string
  tripLinkOrToken: string
}): Promise<{ tripId: string }> {
  const trip = await resolveTrip(input.tripLinkOrToken)
  const admin = createAdminClient()

  await admin
    .from('trip_line_groups')
    .update({ status: 'disabled' })
    .eq('line_group_id', input.lineGroupId)
    .eq('status', 'active')
    .select('id')

  const { error } = await admin
    .from('trip_line_groups')
    .insert({
      line_group_id: input.lineGroupId,
      trip_id: trip.id,
      write_as_user_id: trip.owner_id,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) throw new Error('LINE_BIND_FAILED')
  return { tripId: trip.id }
}

export async function unbindLineGroup(input: { lineGroupId: string }): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('trip_line_groups')
    .update({ status: 'disabled' })
    .eq('line_group_id', input.lineGroupId)
    .eq('status', 'active')
    .select('id')

  if (error) throw new Error('LINE_UNBIND_FAILED')
}

export async function getActiveLineGroupBinding(lineGroupId: string): Promise<LineGroupBinding | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_line_groups')
    .select('line_group_id, trip_id, write_as_user_id, status')
    .eq('line_group_id', lineGroupId)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null
  const row = data as BindingRow
  return {
    lineGroupId: row.line_group_id,
    tripId: row.trip_id,
    writeAsUserId: row.write_as_user_id,
  }
}

async function resolveTrip(tripLinkOrToken: string): Promise<TripRow> {
  const tokenOrId = extractTripTokenOrId(tripLinkOrToken)
  const admin = createAdminClient()

  const byInvite = await admin
    .from('trips')
    .select('id, owner_id, invite_token')
    .eq('invite_token', tokenOrId)
    .single()

  if (byInvite.data) return byInvite.data as TripRow

  const byId = await admin
    .from('trips')
    .select('id, owner_id, invite_token')
    .eq('id', tokenOrId)
    .single()

  if (byId.data) return byId.data as TripRow
  throw new Error('INVALID_TRIP_LINK')
}

function extractTripTokenOrId(value: string): string {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? value
  } catch {
    return value.trim()
  }
}
```

- [ ] **Step 4: Run binding tests**

Run: `npx jest -- line-bindings`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/line/bindings.ts __tests__/line-bindings.test.ts
git commit -m "feat(laneC-line): bind line groups to trips"
```

---

### Task 4: Candidate Source Writer And UI Display

**Files:**
- Modify: `app/actions/candidates.ts`
- Modify: `components/CandidatePanel.tsx`
- Test: `__tests__/candidates-actions.test.ts`
- Test: `__tests__/candidate-panel.test.tsx`

**Interfaces:**
- Consumes: `LineCandidateSource`, `CandidateSource`
- Produces: `addCandidateFromLine({ tripId, writeAsUserId, place, source }): Promise<'added' | 'duplicate'>`
- Updates `listCandidates(tripId)` to select and return `source`

- [ ] **Step 1: Add failing tests for source-aware candidate actions**

Append to `__tests__/candidates-actions.test.ts`:

```ts
it('listCandidates maps source metadata when present', async () => {
  state.listResult = {
    data: [{
      id: 'candidate-1',
      place: placeFixture,
      added_by: 'user-a',
      created_at: '2026-07-04T01:00:00.000Z',
      source: {
        kind: 'line_group',
        lineGroupId: 'Cg123',
        lineDisplayName: '小明',
        messageId: 'm1',
      },
    } as CandidateRow & { source: unknown }],
    error: null,
  }

  const { listCandidates } = loadActions()

  await expect(listCandidates('trip-1')).resolves.toEqual([{
    id: 'candidate-1',
    place: placeFixture,
    addedBy: 'user-a',
    addedByName: 'Alice',
    source: {
      kind: 'line_group',
      lineGroupId: 'Cg123',
      lineDisplayName: '小明',
      messageId: 'm1',
    },
  }])

  expect(state.lastListSelect).toBe('id, place, added_by, created_at, source')
})

it('addCandidateFromLine inserts with source and writeAsUserId', async () => {
  const source = { kind: 'line_group' as const, lineGroupId: 'Cg123', messageId: 'm1' }
  const { addCandidateFromLine } = loadActions()

  await expect(addCandidateFromLine({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place: placeFixture,
    source,
  })).resolves.toBe('added')

  expect(state.lastInsert).toEqual({
    trip_id: 'trip-1',
    place: placeFixture,
    added_by: 'owner-1',
    source,
  })
})
```

Update the test helper types in the same file:

```ts
type InsertPayload = { trip_id: string; place: Place; added_by: string; source?: unknown }
type CandidateRow = { id: string; place: Place; added_by: string; created_at: string; source?: unknown }
```

Update the `createAdminClient` mock in the same file so it can also serve `trip_candidates` for `addCandidateFromLine`:

```ts
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: jest.fn(async (userId: string) => ({
          data: { user: state.profiles[userId] ? { id: userId, ...state.profiles[userId] } : null },
        })),
      },
    },
    from: jest.fn((table: string) => {
      if (table === 'trip_candidates') return makeAdminCandidatesBuilder()
      throw new Error(`Unexpected admin table ${table}`)
    }),
  }),
}))

function makeAdminCandidatesBuilder() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(async () => ({ data: null, error: null })),
      })),
    })),
    insert: jest.fn((payload: InsertPayload) => {
      state.lastInsert = payload
      return Promise.resolve({ data: null, error: null })
    }),
  }
}
```

- [ ] **Step 2: Add failing UI source display test**

Append to `__tests__/candidate-panel.test.tsx`:

```tsx
it('shows LINE source text when candidate came from LINE', () => {
  render(
    <CandidatePanel
      candidates={[{
        ...cand('c1', '台北101'),
        source: {
          kind: 'line_group',
          lineGroupId: 'Cg123',
          lineDisplayName: '小明',
          messageId: 'm1',
        },
      }]}
      onAddPlace={noop}
      onAddPlaces={noop}
      onRemove={noop}
    />,
  )

  expect(screen.getByText('LINE 群組 / 小明 加入')).toBeInTheDocument()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest -- candidates-actions candidate-panel`

Expected: FAIL because `source` is not selected/mapped, `addCandidateFromLine` does not exist, and UI does not render LINE source text.

- [ ] **Step 4: Update candidate actions**

In `app/actions/candidates.ts`, update imports and add types:

```ts
import type { Candidate, CandidateSource, LineCandidateSource, Place } from '@/lib/types'

type CandidateRow = {
  id: string
  place: Place
  added_by: string
  created_at: string
  source?: CandidateSource | null
}
```

Update `listCandidates` select and row mapping:

```ts
const { data, error } = await supabase
  .from('trip_candidates')
  .select('id, place, added_by, created_at, source')
  .eq('trip_id', tripId)
  .order('created_at', { ascending: true })
if (error || !data) return []
const rows = data as CandidateRow[]
```

Change the `out.push` call to:

```ts
out.push({
  id: r.id,
  place: r.place,
  addedBy: r.added_by,
  addedByName: name,
  source: r.source ?? undefined,
})
```

Add this exported server writer below `addCandidate`:

```ts
export async function addCandidateFromLine(input: {
  tripId: string
  writeAsUserId: string
  place: Place
  source: LineCandidateSource
}): Promise<'added' | 'duplicate'> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('trip_candidates')
    .select('id')
    .eq('trip_id', input.tripId)
    .eq('place->>placeId', input.place.placeId)
    .maybeSingle()

  if (existing) return 'duplicate'

  const { error } = await admin
    .from('trip_candidates')
    .insert({
      trip_id: input.tripId,
      place: input.place,
      added_by: input.writeAsUserId,
      source: input.source,
    })

  if (error) throw new Error('LINE_CANDIDATE_INSERT_FAILED')
  return 'added'
}
```

- [ ] **Step 5: Update source display UI**

In `components/CandidatePanel.tsx`, add this helper near the component:

```tsx
function candidateSourceLabel(candidate: Candidate): string {
  if (candidate.source?.kind === 'line_group') {
    return candidate.source.lineDisplayName
      ? `LINE 群組 / ${candidate.source.lineDisplayName} 加入`
      : 'LINE 群組加入'
  }
  return `${candidate.addedByName} 加入`
}
```

Replace the rendered adder label with:

```tsx
<span className="text-xs text-gray-500">{candidateSourceLabel(c)}</span>
```

Use the local loop variable name already present in the file; in the existing C3 plan implementation it is `c`.

- [ ] **Step 6: Run tests**

Run: `npx jest -- candidates-actions candidate-panel`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/actions/candidates.ts components/CandidatePanel.tsx __tests__/candidates-actions.test.ts __tests__/candidate-panel.test.tsx
git commit -m "feat(laneC-line): write and show line candidate sources"
```

---

### Task 5: LINE Client And Ingest Processor

**Files:**
- Create: `lib/line/client.ts`
- Create: `lib/line/ingest.ts`
- Test: `__tests__/line-client.test.ts`
- Test: `__tests__/line-ingest.test.ts`

**Interfaces:**
- Consumes: `getActiveLineGroupBinding`, `parseLineText`, `searchPlace`, `scrapeText`, `extractItinerary`, `addCandidateFromLine`
- Produces:
  - `replyLineMessage(replyToken, text): Promise<void>`
  - `getLineProfile(groupId, userId): Promise<{ displayName: string } | null>`
  - `processLineTextMessage(input): Promise<LineIngestResult>`

- [ ] **Step 1: Write failing LINE client test**

Create `__tests__/line-client.test.ts`:

```ts
const fetchMock = jest.fn()
global.fetch = fetchMock

beforeEach(() => {
  fetchMock.mockReset()
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'token'
})

it('replies to LINE with bearer token', async () => {
  fetchMock.mockResolvedValue({ ok: true })
  const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')

  await replyLineMessage('reply-token', '已加入候選池：台北101')

  expect(fetchMock).toHaveBeenCalledWith('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken: 'reply-token',
      messages: [{ type: 'text', text: '已加入候選池：台北101' }],
    }),
  })
})
```

- [ ] **Step 2: Write failing ingest tests**

Create `__tests__/line-ingest.test.ts`:

```ts
import type { Place } from '@/lib/types'

const getActiveLineGroupBinding = jest.fn()
const searchPlace = jest.fn()
const scrapeText = jest.fn()
const extractItinerary = jest.fn()
const addCandidateFromLine = jest.fn()

jest.mock('@/lib/line/bindings', () => ({
  getActiveLineGroupBinding: (...args: unknown[]) => getActiveLineGroupBinding(...args),
}))
jest.mock('@/app/actions/places', () => ({
  searchPlace: (...args: unknown[]) => searchPlace(...args),
}))
jest.mock('@/app/actions/scrape', () => ({
  scrapeText: (...args: unknown[]) => scrapeText(...args),
}))
jest.mock('@/app/actions/ai', () => ({
  extractItinerary: (...args: unknown[]) => extractItinerary(...args),
}))
jest.mock('@/app/actions/candidates', () => ({
  addCandidateFromLine: (...args: unknown[]) => addCandidateFromLine(...args),
}))

const place: Place = {
  id: 'local-1',
  placeId: 'google-place-1',
  name: '台北101',
  type: 'attraction',
  lat: 25.033,
  lng: 121.565,
  address: '台北市',
  openingHours: null,
  rating: 4.7,
  photoUrl: null,
  description: null,
}

beforeEach(() => {
  jest.resetModules()
  getActiveLineGroupBinding.mockResolvedValue({
    lineGroupId: 'Cg123',
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  searchPlace.mockResolvedValue(place)
  scrapeText.mockResolvedValue('台北101 和 永康街')
  extractItinerary.mockResolvedValue({
    country: 'Taiwan',
    countryCode: 'tw',
    places: [{ name: '台北101', type: 'attraction' }],
  })
  addCandidateFromLine.mockResolvedValue('added')
})

it('ignores unbound group without a reply', async () => {
  getActiveLineGroupBinding.mockResolvedValue(null)
  const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')

  await expect(processLineTextMessage({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '小明',
    messageId: 'm1',
    text: '台北101',
  })).resolves.toEqual({ kind: 'ignored' })
})

it('adds plain text place to candidates', async () => {
  const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')

  await expect(processLineTextMessage({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '小明',
    messageId: 'm1',
    text: '台北101',
  })).resolves.toEqual({ kind: 'reply', text: '已加入候選池：台北101' })

  expect(addCandidateFromLine).toHaveBeenCalledWith(expect.objectContaining({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place,
    source: expect.objectContaining({
      kind: 'line_group',
      lineGroupId: 'Cg123',
      lineUserId: 'U123',
      lineDisplayName: '小明',
      messageId: 'm1',
      messageText: '台北101',
    }),
  }))
})

it('extracts article URL into candidates', async () => {
  const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')

  await expect(processLineTextMessage({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm2',
    text: 'https://travel.example.com/taipei',
  })).resolves.toEqual({ kind: 'reply', text: '已加入候選池：台北101' })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest -- line-client line-ingest`

Expected: FAIL because `client.ts` and `ingest.ts` do not exist.

- [ ] **Step 4: Implement LINE client**

Create `lib/line/client.ts`:

```ts
import 'server-only'

const LINE_API = 'https://api.line.me/v2/bot'

export async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN_MISSING')

  const res = await fetch(`${LINE_API}/message/reply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })

  if (!res.ok) throw new Error('LINE_REPLY_FAILED')
}

export async function getLineProfile(
  groupId: string,
  userId: string,
): Promise<{ displayName: string } | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN
  if (!token) return null

  const res = await fetch(`${LINE_API}/group/${groupId}/member/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json() as { displayName?: string }
  return data.displayName ? { displayName: data.displayName } : null
}
```

- [ ] **Step 5: Implement ingest processor**

Create `lib/line/ingest.ts`:

```ts
import 'server-only'
import { extractItinerary } from '@/app/actions/ai'
import { addCandidateFromLine } from '@/app/actions/candidates'
import { searchPlace } from '@/app/actions/places'
import { scrapeText } from '@/app/actions/scrape'
import { getActiveLineGroupBinding } from '@/lib/line/bindings'
import { parseLineText } from '@/lib/line/parser'
import type { LineCandidateSource, Place } from '@/lib/types'

export type LineIngestResult =
  | { kind: 'ignored' }
  | { kind: 'reply'; text: string }

export async function processLineTextMessage(input: {
  lineGroupId: string
  lineUserId?: string
  lineDisplayName?: string
  messageId: string
  text: string
}): Promise<LineIngestResult> {
  const binding = await getActiveLineGroupBinding(input.lineGroupId)
  if (!binding) return { kind: 'ignored' }

  const parsed = parseLineText(input.text)
  if (parsed.kind === 'ignored' || parsed.kind === 'bind' || parsed.kind === 'unbind' || parsed.kind === 'malformed_bind') {
    return { kind: 'ignored' }
  }

  if (parsed.kind === 'place_text' || parsed.kind === 'google_maps_url') {
    const query = parsed.kind === 'place_text' ? parsed.query : parsed.url
    const place = await searchPlace(query)
    if (!place) return { kind: 'reply', text: '找不到可加入候選池的地點。' }

    const status = await writeLineCandidate(binding.tripId, binding.writeAsUserId, place, {
      input,
      sourceUrl: parsed.kind === 'google_maps_url' ? parsed.url : undefined,
    })
    return { kind: 'reply', text: status === 'duplicate' ? `已在候選池：${place.name}` : `已加入候選池：${place.name}` }
  }

  const text = await scrapeText(parsed.url)
  if (!text) return { kind: 'reply', text: '暫時無法解析這個連結，請稍後再試。' }

  const extracted = await extractItinerary(text)
  let addedCount = 0
  let firstAddedName: string | null = null

  for (const extractedPlace of extracted.places) {
    const place = await searchPlace(extractedPlace.name, extracted.country ?? undefined)
    if (!place) continue
    const typedPlace: Place = { ...place, type: extractedPlace.type }
    const status = await writeLineCandidate(binding.tripId, binding.writeAsUserId, typedPlace, {
      input,
      sourceUrl: parsed.url,
    })
    if (status === 'added') {
      addedCount += 1
      firstAddedName ??= typedPlace.name
    }
  }

  if (addedCount === 0) return { kind: 'reply', text: '找不到可加入候選池的地點。' }
  if (addedCount === 1) return { kind: 'reply', text: `已加入候選池：${firstAddedName}` }
  return { kind: 'reply', text: `已加入 ${addedCount} 個候選。` }
}

async function writeLineCandidate(
  tripId: string,
  writeAsUserId: string,
  place: Place,
  sourceInput: {
    input: { lineGroupId: string; lineUserId?: string; lineDisplayName?: string; messageId: string; text: string }
    sourceUrl?: string
  },
): Promise<'added' | 'duplicate'> {
  const source: LineCandidateSource = {
    kind: 'line_group',
    lineGroupId: sourceInput.input.lineGroupId,
    lineUserId: sourceInput.input.lineUserId,
    lineDisplayName: sourceInput.input.lineDisplayName,
    messageId: sourceInput.input.messageId,
    messageText: sourceInput.input.text,
    sourceUrl: sourceInput.sourceUrl,
  }

  return addCandidateFromLine({ tripId, writeAsUserId, place, source })
}
```

- [ ] **Step 6: Run tests**

Run: `npx jest -- line-client line-ingest`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/line/client.ts lib/line/ingest.ts __tests__/line-client.test.ts __tests__/line-ingest.test.ts
git commit -m "feat(laneC-line): process line messages into candidates"
```

---

### Task 6: Webhook Route And Job Storage

**Files:**
- Create: `lib/line/jobs.ts`
- Create: `app/api/line/webhook/route.ts`
- Test: `__tests__/line-jobs.test.ts`
- Test: `__tests__/line-webhook-route.test.ts`

**Interfaces:**
- Consumes: `verifyLineSignature`, `parseLineText`, `bindLineGroupToTrip`, `unbindLineGroup`, `processLineTextMessage`, `replyLineMessage`, `getLineProfile`
- Produces: `recordLineIngestJob(input): Promise<void>`, `markLineIngestJob(messageId, status, error?): Promise<void>`
- Produces: `POST(request: Request): Promise<Response>`

- [ ] **Step 1: Write failing job storage tests**

Create `__tests__/line-jobs.test.ts`:

```ts
let lastInsert: Record<string, unknown> | null
let lastUpdate: Record<string, unknown> | null
let lastPredicate: { column: string; value: string } | null

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'line_ingest_jobs') throw new Error(`Unexpected table ${table}`)
      return {
        insert: (payload: Record<string, unknown>) => {
          lastInsert = payload
          return Promise.resolve({ error: null })
        },
        update: (payload: Record<string, unknown>) => {
          lastUpdate = payload
          return {
            eq: (column: string, value: string) => {
              lastPredicate = { column, value }
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }),
}))

beforeEach(() => {
  jest.resetModules()
  lastInsert = null
  lastUpdate = null
  lastPredicate = null
})

it('records a LINE ingest job', async () => {
  const { recordLineIngestJob } = require('@/lib/line/jobs') as typeof import('@/lib/line/jobs')

  await recordLineIngestJob({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm1',
    messageText: '台北101',
    eventPayload: { type: 'message' },
  })

  expect(lastInsert).toEqual({
    line_group_id: 'Cg123',
    line_user_id: 'U123',
    message_id: 'm1',
    message_text: '台北101',
    event_payload: { type: 'message' },
    status: 'queued',
  })
})

it('marks a job as done or failed', async () => {
  const { markLineIngestJob } = require('@/lib/line/jobs') as typeof import('@/lib/line/jobs')

  await markLineIngestJob('m1', 'done')
  expect(lastUpdate).toEqual({ status: 'done', error: null, processed_at: expect.any(String) })
  expect(lastPredicate).toEqual({ column: 'message_id', value: 'm1' })

  await markLineIngestJob('m2', 'failed', 'boom')
  expect(lastUpdate).toEqual({ status: 'failed', error: 'boom', processed_at: expect.any(String) })
  expect(lastPredicate).toEqual({ column: 'message_id', value: 'm2' })
})
```

- [ ] **Step 2: Write failing route tests**

Create `__tests__/line-webhook-route.test.ts`:

```ts
const verifyLineSignature = jest.fn()
const parseLineText = jest.fn()
const bindLineGroupToTrip = jest.fn()
const unbindLineGroup = jest.fn()
const processLineTextMessage = jest.fn()
const replyLineMessage = jest.fn()
const getLineProfile = jest.fn()
const recordLineIngestJob = jest.fn()
const markLineIngestJob = jest.fn()

jest.mock('@/lib/line/signature', () => ({ verifyLineSignature: (...a: unknown[]) => verifyLineSignature(...a) }))
jest.mock('@/lib/line/parser', () => ({ parseLineText: (...a: unknown[]) => parseLineText(...a) }))
jest.mock('@/lib/line/bindings', () => ({
  bindLineGroupToTrip: (...a: unknown[]) => bindLineGroupToTrip(...a),
  unbindLineGroup: (...a: unknown[]) => unbindLineGroup(...a),
}))
jest.mock('@/lib/line/ingest', () => ({ processLineTextMessage: (...a: unknown[]) => processLineTextMessage(...a) }))
jest.mock('@/lib/line/client', () => ({
  replyLineMessage: (...a: unknown[]) => replyLineMessage(...a),
  getLineProfile: (...a: unknown[]) => getLineProfile(...a),
}))
jest.mock('@/lib/line/jobs', () => ({
  recordLineIngestJob: (...a: unknown[]) => recordLineIngestJob(...a),
  markLineIngestJob: (...a: unknown[]) => markLineIngestJob(...a),
}))

function request(body: unknown, signature = 'sig'): Request {
  return new Request('https://app.example.com/api/line/webhook', {
    method: 'POST',
    headers: { 'x-line-signature': signature },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.resetModules()
  process.env.LINE_CHANNEL_SECRET = 'secret'
  verifyLineSignature.mockResolvedValue(true)
  parseLineText.mockReturnValue({ kind: 'place_text', query: '台北101' })
  bindLineGroupToTrip.mockResolvedValue({ tripId: 'trip-1' })
  unbindLineGroup.mockResolvedValue(undefined)
  processLineTextMessage.mockResolvedValue({ kind: 'reply', text: '已加入候選池：台北101' })
  replyLineMessage.mockResolvedValue(undefined)
  getLineProfile.mockResolvedValue({ displayName: '小明' })
  recordLineIngestJob.mockResolvedValue(undefined)
  markLineIngestJob.mockResolvedValue(undefined)
})

it('returns 401 for invalid signature', async () => {
  verifyLineSignature.mockResolvedValue(false)
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({ events: [] }))

  expect(res.status).toBe(401)
  expect(replyLineMessage).not.toHaveBeenCalled()
})

it('binds group on bind command and replies success', async () => {
  parseLineText.mockReturnValue({ kind: 'bind', tripLinkOrToken: 'https://app.example.com/join/token-1' })
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({
    events: [{
      type: 'message',
      replyToken: 'reply-1',
      source: { type: 'group', groupId: 'Cg123', userId: 'U123' },
      message: { type: 'text', id: 'm1', text: '/綁定 https://app.example.com/join/token-1' },
    }],
  }))

  expect(res.status).toBe(200)
  expect(bindLineGroupToTrip).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    tripLinkOrToken: 'https://app.example.com/join/token-1',
  })
  expect(replyLineMessage).toHaveBeenCalledWith('reply-1', '已綁定此 LINE 群組到行程。')
})

it('does not reply for ignored unbound group message', async () => {
  processLineTextMessage.mockResolvedValue({ kind: 'ignored' })
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({
    events: [{
      type: 'message',
      replyToken: 'reply-1',
      source: { type: 'group', groupId: 'Cg123', userId: 'U123' },
      message: { type: 'text', id: 'm2', text: '台北101' },
    }],
  }))

  expect(res.status).toBe(200)
  expect(replyLineMessage).not.toHaveBeenCalled()
})

it('processes bound group text and replies', async () => {
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({
    events: [{
      type: 'message',
      replyToken: 'reply-1',
      source: { type: 'group', groupId: 'Cg123', userId: 'U123' },
      message: { type: 'text', id: 'm2', text: '台北101' },
    }],
  }))

  expect(res.status).toBe(200)
  expect(processLineTextMessage).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '小明',
    messageId: 'm2',
    text: '台北101',
  })
  expect(recordLineIngestJob).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm2',
    messageText: '台北101',
    eventPayload: expect.objectContaining({ type: 'message' }),
  })
  expect(markLineIngestJob).toHaveBeenCalledWith('m2', 'done')
  expect(replyLineMessage).toHaveBeenCalledWith('reply-1', '已加入候選池：台北101')
})
```

- [ ] **Step 3: Run route tests to verify they fail**

Run: `npx jest -- line-jobs line-webhook-route`

Expected: FAIL because `lib/line/jobs.ts` and the webhook route do not exist.

- [ ] **Step 4: Implement job storage**

Create `lib/line/jobs.ts`:

```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LineIngestJobStatus } from '@/lib/types'

export async function recordLineIngestJob(input: {
  lineGroupId: string
  lineUserId?: string
  messageId: string
  messageText: string
  eventPayload: unknown
}): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('line_ingest_jobs').insert({
    line_group_id: input.lineGroupId,
    line_user_id: input.lineUserId ?? null,
    message_id: input.messageId,
    message_text: input.messageText,
    event_payload: input.eventPayload,
    status: 'queued',
  })
  if (error) throw new Error('LINE_JOB_RECORD_FAILED')
}

export async function markLineIngestJob(
  messageId: string,
  status: Exclude<LineIngestJobStatus, 'queued' | 'processing'>,
  errorMessage: string | null = null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('line_ingest_jobs')
    .update({
      status,
      error: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq('message_id', messageId)
  if (error) throw new Error('LINE_JOB_UPDATE_FAILED')
}
```

- [ ] **Step 5: Implement webhook route**

Create `app/api/line/webhook/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { bindLineGroupToTrip, unbindLineGroup } from '@/lib/line/bindings'
import { getLineProfile, replyLineMessage } from '@/lib/line/client'
import { processLineTextMessage } from '@/lib/line/ingest'
import { markLineIngestJob, recordLineIngestJob } from '@/lib/line/jobs'
import { parseLineText } from '@/lib/line/parser'
import { verifyLineSignature } from '@/lib/line/signature'

type LineWebhookBody = { events?: LineEvent[] }
type LineEvent = {
  type?: string
  replyToken?: string
  source?: {
    type?: string
    groupId?: string
    roomId?: string
    userId?: string
  }
  message?: {
    type?: string
    id?: string
    text?: string
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  const signature = request.headers.get('x-line-signature')
  const valid = await verifyLineSignature(body, signature, process.env.LINE_CHANNEL_SECRET)
  if (!valid) return new NextResponse('invalid signature', { status: 401 })

  const payload = JSON.parse(body) as LineWebhookBody
  for (const event of payload.events ?? []) {
    await handleEvent(event)
  }

  return NextResponse.json({ ok: true })
}

async function handleEvent(event: LineEvent): Promise<void> {
  if (event.type !== 'message' || event.message?.type !== 'text') return

  const lineGroupId = event.source?.groupId ?? event.source?.roomId
  const replyToken = event.replyToken
  const text = event.message.text ?? ''
  const messageId = event.message.id ?? ''

  if (!lineGroupId || !replyToken || !messageId) {
    if (replyToken && event.source?.type === 'user') {
      await replyLineMessage(replyToken, '請把 bot 加到 LINE 群組後再綁定行程。')
    }
    return
  }

  const parsed = parseLineText(text)
  if (parsed.kind === 'malformed_bind') {
    await replyLineMessage(replyToken, '請輸入 /綁定 <行程分享連結>')
    return
  }

  if (parsed.kind === 'bind') {
    try {
      await bindLineGroupToTrip({ lineGroupId, tripLinkOrToken: parsed.tripLinkOrToken })
      await replyLineMessage(replyToken, '已綁定此 LINE 群組到行程。')
    } catch {
      await replyLineMessage(replyToken, '找不到這個行程，請確認分享連結是否正確。')
    }
    return
  }

  if (parsed.kind === 'unbind') {
    await unbindLineGroup({ lineGroupId })
    await replyLineMessage(replyToken, '已解除此 LINE 群組的行程綁定。')
    return
  }

  const profile = event.source?.userId
    ? await getLineProfile(lineGroupId, event.source.userId)
    : null

  await recordLineIngestJob({
    lineGroupId,
    lineUserId: event.source?.userId,
    messageId,
    messageText: text,
    eventPayload: event,
  })

  let result
  try {
    result = await processLineTextMessage({
      lineGroupId,
      lineUserId: event.source?.userId,
      lineDisplayName: profile?.displayName,
      messageId,
      text,
    })
    await markLineIngestJob(messageId, result.kind === 'ignored' ? 'ignored' : 'done')
  } catch (error) {
    await markLineIngestJob(messageId, 'failed', error instanceof Error ? error.message : 'unknown error')
    throw error
  }

  if (result.kind === 'reply') {
    await replyLineMessage(replyToken, result.text)
  }
}
```

- [ ] **Step 6: Run route tests**

Run: `npx jest -- line-jobs line-webhook-route`

Expected: PASS.

- [ ] **Step 7: Run focused LINE/Candidate suite**

Run:

```bash
npx jest -- line-types line-signature line-parser line-bindings line-client line-ingest line-jobs line-webhook-route candidates-actions candidate-panel
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/line/jobs.ts app/api/line/webhook/route.ts __tests__/line-jobs.test.ts __tests__/line-webhook-route.test.ts
git commit -m "feat(laneC-line): add line webhook route"
```

---

### Task 7: Final Integration And Documentation

**Files:**
- Modify: `.env.local.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-01-laneC-roadmap.md`

**Interfaces:**
- Consumes: completed Tasks 1-6
- Produces: documented LINE env setup and roadmap status for C5

- [ ] **Step 1: Add environment example**

Append to `.env.local.example`:

```txt
# LINE Messaging API
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_WEBHOOK_PROCESSING_MODE=sync
```

- [ ] **Step 2: Add README setup note**

Add this section to `README.md`:

```md
## LINE Group Candidate Ingest

The LINE webhook endpoint is `/api/line/webhook`.

Required LINE Messaging API environment variables:

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`

MVP behavior:

- Add the LINE bot to a group.
- Send `/綁定 <trip share link>` once.
- After binding, Google Maps URLs, article URLs, and plain text place names are added to the trip candidate pool.
- Unbound groups stay silent for normal messages.
```

- [ ] **Step 3: Update Lane C roadmap**

In `docs/superpowers/specs/2026-07-01-laneC-roadmap.md`, add or update the C5 row to mention:

```md
| C5 | LINE group candidate ingest | CODE COMPLETE pending live LINE verification | C2, C3, C4 |
```

If the file is still mojibake in the local terminal, preserve the existing table structure and only adjust the C5 status line.

- [ ] **Step 4: Run full validation**

Run:

```bash
npx jest
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 5: Manual live verification checklist**

Record these as pending if LINE credentials are unavailable:

```txt
1. Configure LINE Messaging API channel webhook URL to /api/line/webhook.
2. Add bot to a LINE group.
3. Send /綁定 <join link>.
4. Send a Google Maps URL and confirm candidate appears.
5. Send a travel article URL and confirm candidates appear.
6. Send a plain text place name and confirm candidate appears.
7. Send a normal message in an unbound group and confirm bot stays silent.
```

- [ ] **Step 6: Commit**

```bash
git add .env.local.example README.md docs/superpowers/specs/2026-07-01-laneC-roadmap.md
git commit -m "docs(laneC-line): document line webhook setup"
```

---

## Self-Review

**Spec coverage:**
- LINE webhook endpoint and signature verification: Task 2 and Task 6.
- Group binding and one active trip per group: Task 1 and Task 3.
- `/綁定` and `/解除綁定`: Task 2, Task 3, Task 6.
- Google Maps URL, article URL, and plain text ingest: Task 2 and Task 5.
- Unbound groups stay silent: Task 5 and Task 6.
- Candidate source metadata and UI display: Task 1 and Task 4.
- Duplicate candidate handling by `placeId`: Task 4.
- Server-only LINE secrets: Task 5, Task 6, Task 7.
- Validation and live verification: Task 7.

**Type consistency:**
- `write_as_user_id` in SQL maps to `writeAsUserId` in TypeScript.
- `LineCandidateSource.kind` is always `'line_group'`.
- `Candidate.source` is optional so existing C3 candidates remain valid.
- `processLineTextMessage` returns only `{ kind: 'ignored' }` or `{ kind: 'reply'; text }`, which the route consumes directly.

**Known implementation note:**
- Task 6 records every normal LINE message in `line_ingest_jobs`, then processes it synchronously for MVP. If webhook latency becomes an issue, split Task 6 into enqueue-only route plus a worker route that calls `processLineTextMessage`.
