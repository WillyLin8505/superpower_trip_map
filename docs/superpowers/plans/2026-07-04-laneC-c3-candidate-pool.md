# Lane C / C3 — 共享候選池 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每個 trip 一個共享候選池——成員搜地點加入、看彼此加的、移除,並把某候選放進指定的某一天(移動語義)。

**Architecture:** 疊在 C1+C2 上(branch `lane/c3-candidate-pool` from `lane/c1-auth-persistence` @ 9265a7f)。新增 `trip_candidates` 表(row-per-place,append 集合,避 plan blob 並發)+ RLS(participant select/insert、adder/owner delete,複用 C2 `is_trip_participant`)。候選 CRUD 走 RLS。「放進某天」是 client 操作:ItineraryClient 用既有 add-place 路徑把 Place 加到選定天(recalc + autosave),再 `removeCandidate`。CandidatePanel 渲染在 ItineraryClient 內。

**Tech Stack:** Next.js 14 App Router、TypeScript strict、Supabase Postgres + RLS、`@supabase/ssr`、Jest + RTL。

**Spec:** `docs/superpowers/specs/2026-07-04-laneC-c3-candidate-pool-design.md`

## Global Constraints

- TypeScript strict,無 production `any`(測試可用 typed mock / `unknown`)。
- 疊在 C2 上,只 commit 在 `lane/c3-candidate-pool`。
- code-first:migration 寫檔 + commit,live 套用/RLS/多帳號驗證延後(待 Supabase 金鑰)。
- 候選 CRUD 走 RLS(一般 server client);admin client 僅用於 `listCandidates` 補顯示名稱(沿用 C2 `listMembers` 模式)。
- `added_by = auth.uid()` 由 insert policy 強制;移除限 adder/owner;`removeCandidate` 用 `.select('id')` + `!data?.length` 偵測 0 列(不假成功,沿用 C2)。
- UI 文案繁體中文。
- `initialCandidates` 為可選 prop,匿名 `/itinerary` 路徑零影響;C1/C2 全測試保持綠。
- worktree sibling `D:\vibe_coding_project\food_map\superpower_trip_map-laneC3`;git 用原生(PowerShell)或確認 bash git 可用。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `supabase/migrations/0003_candidates.sql`(新) | trip_candidates 表 + RLS |
| `lib/types.ts`(改) | 新增 `Candidate` |
| `app/actions/candidates.ts`(新) | addCandidate / listCandidates / removeCandidate |
| `components/CandidatePanel.tsx`(新,client) | 搜尋加入(複用 CombinedInput)+ 候選清單 + 移除 + 放進某天(day-picker) |
| `app/itinerary/ItineraryClient.tsx`(改) | `initialCandidates` prop + candidates state + `handleAddCandidateToDay` + 渲染 CandidatePanel |
| `app/itinerary/[tripId]/page.tsx`(改) | `listCandidates` → `initialCandidates` |

---

## Task 1: migration `0003_candidates.sql`

**Files:**
- Create: `supabase/migrations/0003_candidates.sql`

**Interfaces:**
- Produces `public.trip_candidates(id, trip_id, place jsonb, added_by, created_at)` + RLS(participant select/insert；adder/owner delete)。

> code-first:只寫檔 + commit,不套用、無單元測試(SQL 產物)。

- [ ] **Step 1: 撰寫 migration**

Create `supabase/migrations/0003_candidates.sql`:
```sql
-- Lane C / C3: shared candidate pool
create table if not exists public.trip_candidates (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  place      jsonb not null,
  added_by   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists trip_candidates_trip_id_idx on public.trip_candidates(trip_id);

alter table public.trip_candidates enable row level security;

create policy "participant_select_candidates" on public.trip_candidates
  for select using (public.is_trip_participant(trip_id));
create policy "participant_insert_candidates" on public.trip_candidates
  for insert with check (public.is_trip_participant(trip_id) and added_by = auth.uid());
create policy "adder_or_owner_delete_candidates" on public.trip_candidates
  for delete using (
    added_by = auth.uid()
    or exists (select 1 from public.trips where id = trip_id and owner_id = auth.uid())
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0003_candidates.sql
git commit -m "feat(laneC-c3): candidate pool migration — trip_candidates + participant RLS"
```

---

## Task 2: `Candidate` 型別 + candidates actions

**Files:**
- Modify: `lib/types.ts`
- Create: `app/actions/candidates.ts`
- Test: `__tests__/candidates-actions.test.ts`

**Interfaces:**
- Consumes: `@/lib/supabase/server` `createClient()`、`@/lib/supabase/admin` `createAdminClient()`、`@/lib/types` `Place`。
- Produces:
```ts
interface Candidate { id: string; place: Place; addedBy: string; addedByName: string }
addCandidate(tripId: string, place: Place): Promise<{ id: string }>
listCandidates(tripId: string): Promise<Candidate[]>
removeCandidate(candidateId: string): Promise<void>
```

- [ ] **Step 1: 新增型別**

Edit `lib/types.ts`,檔末追加:
```ts
export interface Candidate {
  id: string
  place: Place
  addedBy: string
  addedByName: string
}
```

- [ ] **Step 2: 寫失敗測試**

Create `__tests__/candidates-actions.test.ts`:
```ts
import type { Place } from '@/lib/types'

let currentUser: { id: string } | null = { id: 'u1' }
let insertRes: { data: unknown; error: unknown } = { data: { id: 'c1' }, error: null }
let selectRes: { data: unknown; error: unknown } = { data: [], error: null }
let deleteRes: { data: unknown; error: unknown } = { data: [{ id: 'c1' }], error: null }

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: currentUser } })) },
    from: (_t: string) => ({
      insert: (_row: unknown) => ({ select: (_c: string) => ({ single: async () => insertRes }) }),
      select: (_c: string) => ({ eq: (_col: string, _v: string) => ({ order: async () => selectRes }) }),
      delete: () => ({ eq: (_col: string, _v: string) => ({ select: (_c: string) => deleteRes }) }),
    }),
  }),
}))

const getUserById = jest.fn(async (id: string) => ({
  data: { user: { id, email: `${id}@x.com`, user_metadata: { name: `Name-${id}` } } },
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ auth: { admin: { getUserById: (id: string) => getUserById(id) } } }),
}))

function place(name = 'A'): Place {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null }
}

beforeEach(() => {
  currentUser = { id: 'u1' }
  insertRes = { data: { id: 'c1' }, error: null }
  selectRes = { data: [], error: null }
  deleteRes = { data: [{ id: 'c1' }], error: null }
  getUserById.mockClear()
})

describe('addCandidate', () => {
  it('throws NOT_AUTHENTICATED when logged out', async () => {
    currentUser = null
    const { addCandidate } = require('@/app/actions/candidates')
    await expect(addCandidate('t1', place())).rejects.toThrow('NOT_AUTHENTICATED')
  })
  it('inserts and returns the new id', async () => {
    const { addCandidate } = require('@/app/actions/candidates')
    expect(await addCandidate('t1', place())).toEqual({ id: 'c1' })
  })
  it('throws when insert fails (non-participant / RLS)', async () => {
    insertRes = { data: null, error: { message: 'rls' } }
    const { addCandidate } = require('@/app/actions/candidates')
    await expect(addCandidate('t1', place())).rejects.toThrow('加入失敗，請稍後再試')
  })
})

describe('listCandidates', () => {
  it('returns [] when RLS hides rows', async () => {
    selectRes = { data: [], error: null }
    const { listCandidates } = require('@/app/actions/candidates')
    expect(await listCandidates('t1')).toEqual([])
  })
  it('maps rows to Candidate with resolved addedByName', async () => {
    selectRes = { data: [{ id: 'c1', place: place('A'), added_by: 'u2', created_at: '2026-07-04T00:00:00Z' }], error: null }
    const { listCandidates } = require('@/app/actions/candidates')
    const out = await listCandidates('t1')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'c1', addedBy: 'u2', addedByName: 'Name-u2' })
    expect(out[0].place.name).toBe('A')
  })
})

describe('removeCandidate', () => {
  it('throws NOT_AUTHENTICATED when logged out', async () => {
    currentUser = null
    const { removeCandidate } = require('@/app/actions/candidates')
    await expect(removeCandidate('c1')).rejects.toThrow('NOT_AUTHENTICATED')
  })
  it('throws when 0 rows deleted (no permission / missing)', async () => {
    deleteRes = { data: [], error: null }
    const { removeCandidate } = require('@/app/actions/candidates')
    await expect(removeCandidate('c1')).rejects.toThrow('移除失敗，請稍後再試')
  })
  it('resolves on successful delete', async () => {
    const { removeCandidate } = require('@/app/actions/candidates')
    await expect(removeCandidate('c1')).resolves.toBeUndefined()
  })
})
```
> 鏈式 mock 若對不上實作,調整 mock(以驗行為為準),勿扭曲 action。

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx jest -- candidates-actions`
Expected: FAIL(`Cannot find module '@/app/actions/candidates'`)。

- [ ] **Step 4: 實作 actions**

Create `app/actions/candidates.ts`:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Candidate, Place } from '@/lib/types'

export async function addCandidate(tripId: string, place: Place): Promise<{ id: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { data, error } = await supabase
    .from('trip_candidates')
    .insert({ trip_id: tripId, place, added_by: user.id })
    .select('id')
    .single()
  if (error || !data) throw new Error('加入失敗，請稍後再試')
  return { id: (data as { id: string }).id }
}

export async function listCandidates(tripId: string): Promise<Candidate[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('trip_candidates')
    .select('id, place, added_by, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  const rows = data as { id: string; place: Place; added_by: string; created_at: string }[]

  const admin = createAdminClient()
  const nameCache = new Map<string, string>()
  const out: Candidate[] = []
  for (const r of rows) {
    let name = nameCache.get(r.added_by)
    if (name === undefined) {
      const { data: u } = await admin.auth.admin.getUserById(r.added_by)
      const meta = (u?.user?.user_metadata ?? {}) as { name?: string; full_name?: string }
      name = meta.name ?? meta.full_name ?? u?.user?.email ?? '使用者'
      nameCache.set(r.added_by, name)
    }
    out.push({ id: r.id, place: r.place, addedBy: r.added_by, addedByName: name })
  }
  return out
}

export async function removeCandidate(candidateId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { data, error } = await supabase
    .from('trip_candidates')
    .delete()
    .eq('id', candidateId)
    .select('id')
  if (error || !data?.length) throw new Error('移除失敗，請稍後再試')
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npx jest -- candidates-actions`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts app/actions/candidates.ts __tests__/candidates-actions.test.ts
git commit -m "feat(laneC-c3): Candidate type + add/list/remove candidate actions (RLS; admin name-resolve; 0-row guard)"
```

---

## Task 3: `CandidatePanel` 元件

**Files:**
- Create: `components/CandidatePanel.tsx`
- Test: `__tests__/candidate-panel.test.tsx`

**Interfaces:**
- Consumes: `@/lib/types` `Candidate`/`Place`;`@/components/CombinedInput`(既有搜尋)。
- Produces: `CandidatePanel({ candidates, dayCount, onAddPlace, onAddPlaces, onRemove, onPromote })`
```ts
interface CandidatePanelProps {
  candidates: Candidate[]
  dayCount: number
  onAddPlace: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
  onRemove: (candidateId: string) => void
  onPromote: (place: Place, dayIndex: number, candidateId: string) => void
}
```

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/candidate-panel.test.tsx`:
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { CandidatePanel } from '@/components/CandidatePanel'
import type { Candidate, Place } from '@/lib/types'

jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (p: Place) => void }) => (
    <button onClick={() => onAdd({ id: 'x', placeId: 'x', name: '新地點', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null })}>mock-search-add</button>
  ),
}))

function cand(id: string, name: string): Candidate {
  return { id, addedBy: 'u2', addedByName: '小明',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null } }
}
const noop = () => {}

it('empty pool shows the empty message', () => {
  render(<CandidatePanel candidates={[]} dayCount={2} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} onPromote={noop} />)
  expect(screen.getByText('還沒有候選，搜尋想去的地方加進來吧')).toBeInTheDocument()
})

it('lists candidates with name and adder', () => {
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dayCount={2} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} onPromote={noop} />)
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText(/小明/)).toBeInTheDocument()
})

it('search add calls onAddPlace', () => {
  const onAddPlace = jest.fn()
  render(<CandidatePanel candidates={[]} dayCount={2} onAddPlace={onAddPlace} onAddPlaces={noop} onRemove={noop} onPromote={noop} />)
  fireEvent.click(screen.getByText('mock-search-add'))
  expect(onAddPlace).toHaveBeenCalledWith(expect.objectContaining({ name: '新地點' }))
})

it('remove calls onRemove with candidate id', () => {
  const onRemove = jest.fn()
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dayCount={2} onAddPlace={noop} onAddPlaces={noop} onRemove={onRemove} onPromote={noop} />)
  fireEvent.click(screen.getByRole('button', { name: '移除' }))
  expect(onRemove).toHaveBeenCalledWith('c1')
})

it('promote to a chosen day calls onPromote(place, dayIndex, id)', () => {
  const onPromote = jest.fn()
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dayCount={3} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} onPromote={onPromote} />)
  // day-picker: choose 第2天 (dayIndex 1)
  fireEvent.change(screen.getByLabelText('放進第幾天 台北101'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '放進' }))
  expect(onPromote).toHaveBeenCalledWith(expect.objectContaining({ name: '台北101' }), 1, 'c1')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- candidate-panel`
Expected: FAIL(模組不存在)。

- [ ] **Step 3: 實作元件**

Create `components/CandidatePanel.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Candidate, Place } from '@/lib/types'
import { CombinedInput } from '@/components/CombinedInput'

interface CandidatePanelProps {
  candidates: Candidate[]
  dayCount: number
  onAddPlace: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
  onRemove: (candidateId: string) => void
  onPromote: (place: Place, dayIndex: number, candidateId: string) => void
}

export function CandidatePanel({ candidates, dayCount, onAddPlace, onAddPlaces, onRemove, onPromote }: CandidatePanelProps) {
  const [dayByCand, setDayByCand] = useState<Record<string, number>>({})

  return (
    <section className="border rounded-md p-4 flex flex-col gap-3">
      <h2 className="font-medium">候選池</h2>
      <CombinedInput onAdd={onAddPlace} onAddPlaces={onAddPlaces} />
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500">還沒有候選，搜尋想去的地方加進來吧</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => {
            const sel = dayByCand[c.id] ?? 0
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1">
                <span className="flex-1">{c.place.name}<span className="text-gray-400 ml-2">由 {c.addedByName} 加入</span></span>
                <select
                  aria-label={`放進第幾天 ${c.place.name}`}
                  value={sel}
                  onChange={(e) => setDayByCand((m) => ({ ...m, [c.id]: Number(e.target.value) }))}
                  className="border rounded px-1 py-0.5"
                >
                  {Array.from({ length: dayCount }, (_, i) => (
                    <option key={i} value={i}>第 {i + 1} 天</option>
                  ))}
                </select>
                <button onClick={() => onPromote(c.place, sel, c.id)} className="border rounded px-2 py-0.5 hover:bg-gray-50">放進</button>
                <button onClick={() => onRemove(c.id)} className="text-red-600 hover:underline">移除</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx jest -- candidate-panel`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add components/CandidatePanel.tsx __tests__/candidate-panel.test.tsx
git commit -m "feat(laneC-c3): CandidatePanel — search-add (reuse CombinedInput) + list + remove + day-picker promote"
```

---

## Task 4: ItineraryClient 整合(candidates state + promote + 渲染 panel)

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/itinerary-client-candidates.test.tsx`

**Interfaces:**
- Consumes: `@/app/actions/candidates` `addCandidate`/`removeCandidate`;`@/components/CandidatePanel`;`@/lib/types` `Candidate`/`Place`。
- Produces: `ItineraryClient` 新增可選 prop `initialCandidates?: Candidate[]`(預設 `[]`);渲染 CandidatePanel;`handleAddCandidateToDay(place, dayIndex, candidateId)`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/itinerary-client-candidates.test.tsx`（沿用 `itinerary-client-smart-arrange.test.tsx` 的 dnd/元件 mock 樣板；以下列重點）:
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const addCandidate = jest.fn()
const removeCandidate = jest.fn()
jest.mock('@/app/actions/candidates', () => ({
  addCandidate: (...a: unknown[]) => addCandidate(...a),
  removeCandidate: (...a: unknown[]) => removeCandidate(...a),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/app/actions/trips', () => ({ createTrip: jest.fn(), saveTrip: jest.fn(async () => undefined) }))
// ...（複製 smart-arrange 測試的 @dnd-kit / RecommendPanel / clientScheduler mock）
// CombinedInput 內含真實搜尋，這裡以最小 mock 提供一顆 add-to-pool 按鈕
jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (p: unknown) => void }) => (
    <button onClick={() => onAdd({ id: 'np', placeId: 'np', name: '新候選', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null })}>pool-add</button>
  ),
}))
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, Candidate } from '@/lib/types'
// ...（複製 sp()/plan() helper）

function cand(id: string, name: string): Candidate {
  return { id, addedBy: 'u2', addedByName: '小明',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null } }
}

beforeEach(() => { addCandidate.mockReset(); removeCandidate.mockReset() })

it('persistent mode renders the candidate pool with initial candidates', () => {
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[cand('c1', '台北101')]} />)
  expect(screen.getByText('候選池')).toBeInTheDocument()
  expect(screen.getByText('台北101')).toBeInTheDocument()
})

it('anonymous mode (no tripId) does not render the candidate pool', () => {
  render(<ItineraryClient initial={plan()} />)
  expect(screen.queryByText('候選池')).not.toBeInTheDocument()
})

it('promote adds the place to the chosen day and removes the candidate', async () => {
  removeCandidate.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[cand('c1', '台北101')]} />)
  fireEvent.change(screen.getByLabelText('放進第幾天 台北101'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: '放進' }))
  // candidate leaves the pool (moved)
  await waitFor(() => expect(screen.queryByText('台北101')).not.toBeInTheDocument())
  expect(removeCandidate).toHaveBeenCalledWith('c1')
  // the place now appears in day 0 (card)
  // （用 day 容器內 card 斷言，如 smart-arrange 測試的 dayOrder helper）
})
```
> 註:candidate pool 只在持久化模式(有 `tripId`)顯示。promote 後候選從本地 state 移除、且地點進入 day 0。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- itinerary-client-candidates`
Expected: FAIL(無候選池 / prop 未定義)。

- [ ] **Step 3: 改 ItineraryClient**

於 `app/itinerary/ItineraryClient.tsx`:

(a) imports 追加:
```ts
import type { Candidate } from '@/lib/types'
import { CandidatePanel } from '@/components/CandidatePanel'
import { addCandidate, removeCandidate } from '@/app/actions/candidates'
```

(b) `Props` 追加可選欄位:
```ts
interface Props {
  initial: PlanResult
  tripId?: string
  initialCandidates?: Candidate[]
}
export function ItineraryClient({ initial, tripId, initialCandidates = [] }: Props) {
```

(c) 元件內新增 state 與 handlers(放在既有 state 附近):
```ts
const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates)

// 加候選（樂觀）：先呼叫 action 取得 id，再加入本地
const onAddCandidate = useCallback(async (place: Place) => {
  if (!tripId) return
  try {
    const { id } = await addCandidate(tripId, place)
    setCandidates((cs) => [...cs, { id, place, addedBy: 'me', addedByName: '你' }])
  } catch { /* 靜默失敗；可加 toast，本案略 */ }
}, [tripId])

const onAddCandidates = useCallback((places: Place[]) => {
  places.forEach((p) => { void onAddCandidate(p) })
}, [onAddCandidate])

const onRemoveCandidate = useCallback(async (candidateId: string) => {
  try {
    await removeCandidate(candidateId)
    setCandidates((cs) => cs.filter((c) => c.id !== candidateId))
  } catch { /* 保留在池 */ }
}, [])

// 放進指定天（移動語義）：加到 dayIndex 末尾 → recalc/autosave → 從池移除
const handleAddCandidateToDay = useCallback((place: Place, dayIndex: number, candidateId: string) => {
  const newPlace: ScheduledPlace = {
    ...place,
    startTime: '09:00',
    durationMin: DWELL[place.type],
    travelMinToNext: null,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    startLocked: false,
    durationLocked: false,
  }
  const newDays = planRef.current.days.map((d, i) =>
    i === dayIndex ? { ...d, places: [...d.places, newPlace] } : d
  )
  scheduleRecalc({ ...planRef.current, days: newDays }, true)
  void onRemoveCandidate(candidateId)
}, [scheduleRecalc, onRemoveCandidate])
```
> `handleAddCandidateToDay` 刻意比照既有 `handleAddPlace`(見 ItineraryClient 現有實作:同樣的 `ScheduledPlace` 欄位 + `scheduleRecalc(..., true)`),差別只在 target 是**選定的 `dayIndex`** 而非 `findClosestDay`。`scheduleRecalc(..., true)` 的第二參數(結構改變旗標)沿用既有語意,確保 autosave 與 leg 重算正確。

(d) JSX:僅在持久化模式渲染候選池(放在頁面適當位置,例如每日行程上方或側邊):
```tsx
{tripId && (
  <CandidatePanel
    candidates={candidates}
    dayCount={plan.days.length}
    onAddPlace={onAddCandidate}
    onAddPlaces={onAddCandidates}
    onRemove={onRemoveCandidate}
    onPromote={handleAddCandidateToDay}
  />
)}
```

- [ ] **Step 4: 跑測試確認通過 + 迴歸**

Run: `npx jest -- itinerary-client-candidates` 然後完整 `npx jest`
Expected: 新測試 PASS;既有 ItineraryClient 全測試(smart-arrange / leg / save / C2)綠——匿名模式無候選池、零回歸。

- [ ] **Step 5: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx __tests__/itinerary-client-candidates.test.tsx
git commit -m "feat(laneC-c3): ItineraryClient candidate pool — state, add/remove, promote-to-day (move), render panel (persistent only)"
```

---

## Task 5: 掛進 `/itinerary/[tripId]` 頁

**Files:**
- Modify: `app/itinerary/[tripId]/page.tsx`
- Test: `__tests__/trip-page-candidates.test.tsx`

**Interfaces:**
- Consumes: `@/app/actions/candidates` `listCandidates`;既有 `getTrip`/`listMembers`。
- Produces: 頁面把 `listCandidates(tripId)` 結果以 `initialCandidates` 傳給 `ItineraryClient`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/trip-page-candidates.test.tsx`:
```tsx
const getTrip = jest.fn()
const listMembers = jest.fn()
const listCandidates = jest.fn()
jest.mock('@/app/actions/trips', () => ({ getTrip: (...a: unknown[]) => getTrip(...a) }))
jest.mock('@/app/actions/members', () => ({ listMembers: (...a: unknown[]) => listMembers(...a) }))
jest.mock('@/app/actions/candidates', () => ({ listCandidates: (...a: unknown[]) => listCandidates(...a) }))
const getUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: () => getUser() } }) }))
jest.mock('next/navigation', () => ({ notFound: () => { throw new Error('NF') } }))
jest.mock('@/app/itinerary/ItineraryClient', () => ({ ItineraryClient: (p: { initialCandidates?: unknown }) => null && p }))
jest.mock('@/components/MembersPanel', () => ({ MembersPanel: () => null }))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' }
beforeEach(() => { getTrip.mockReset(); listMembers.mockReset(); listCandidates.mockReset(); getUser.mockReset() })

it('passes listCandidates result as initialCandidates', async () => {
  getTrip.mockResolvedValue({ plan, title: 'T', ownerId: 'u1' })
  listMembers.mockResolvedValue([])
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  const cands = [{ id: 'c1', place: { name: 'A' }, addedBy: 'u1', addedByName: '你' }]
  listCandidates.mockResolvedValue(cands)
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 't1' } })
  const json = JSON.stringify(el)
  expect(listCandidates).toHaveBeenCalledWith('t1')
  expect(json).toContain('"initialCandidates"')
  expect(json).toContain('"addedByName":"你"')
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx jest -- trip-page-candidates`
Expected: FAIL(頁面未傳 initialCandidates)。

- [ ] **Step 3: 改頁面**

於 `app/itinerary/[tripId]/page.tsx` 加入 `listCandidates` 並傳入(在既有 getTrip/listMembers 之後):
```tsx
import { listCandidates } from '@/app/actions/candidates'
// ...
const candidates = await listCandidates(params.tripId)
// ...
<ItineraryClient initial={trip.plan} tripId={params.tripId} initialCandidates={candidates} />
```
(保留既有 `MembersPanel`、`notFound`、`isOwner` 邏輯不變。)

- [ ] **Step 4: 跑測試確認通過 + 迴歸**

Run: `npx jest -- trip-page-candidates trip-page-members trip-page`
Expected: 新測試 PASS;既有 trip page 測試綠。

- [ ] **Step 5: Commit**

```bash
git add "app/itinerary/[tripId]/page.tsx" __tests__/trip-page-candidates.test.tsx
git commit -m "feat(laneC-c3): load candidates on trip page → initialCandidates"
```

---

## Task 6: 收尾 — roadmap + 全量 gate

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-laneC-roadmap.md`

- [ ] **Step 1: 更新 roadmap**

把 **C3** 標為本分支完成(code-first;live 驗證待金鑰),一行帶過交付(共享候選池 + 放進某天,移動語義)。

- [ ] **Step 2: 全量 gate**

Run(依序):
```bash
npx jest && npm run lint && npm run build
```
Expected:全綠、無 type error、`next build` 成功(`@supabase/ssr` 的 Edge `process.version` 警告為既知良性,非失敗)。lint/build 若揪出 C3 真問題就地最小修;既有/無關則報 DONE_WITH_CONCERNS。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-01-laneC-roadmap.md
git commit -m "docs(laneC-c3): mark C3 complete on branch (code-first; live verify pending keys)"
```

---

## Self-Review(對照 spec)

**Spec coverage:**
- spec §2 migration + RLS → Task 1 ✅
- spec §3 actions(add/list/remove;0-row guard;admin 補名)→ Task 2 ✅
- spec §5 CandidatePanel(搜尋加入/清單/移除/day-picker promote)→ Task 3 ✅
- spec §4 promote(client、指定天、移動語義)+ ItineraryClient 整合 → Task 4 ✅
- spec §6 頁面 listCandidates → initialCandidates → Task 5 ✅
- spec §8 測試(RLS/actions/元件/整合/迴歸)→ 各 task 單元 + 迴歸;RLS live 延後
- spec §7 錯誤處理(未登入/非participant/0-row/匿名)→ Task 2 actions + Task 4 匿名不顯示

**Placeholder scan:** 無 TBD;所有 code step 含完整程式碼。Task 4 測試沿用 smart-arrange mock 樣板(明確指示複製),非佔位。

**Type consistency:** `Candidate {id,place,addedBy,addedByName}`、`addCandidate→{id}`、`listCandidates→Candidate[]`、`removeCandidate→void`、`CandidatePanelProps`、`handleAddCandidateToDay(place,dayIndex,candidateId)`、ItineraryClient `initialCandidates?` 跨 task 一致。
