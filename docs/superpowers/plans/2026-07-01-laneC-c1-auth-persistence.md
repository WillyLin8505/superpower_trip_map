# Lane C / C1 — 登入 + 持久化地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓行程能以 Google / LINE 登入後存到 Supabase、擁有穩定可重整的網址,且不破壞現有匿名試用流程。

**Architecture:** 既有編輯核心(排程/拖拉/卡片)完全不動;只在外圍加兩個接縫——「載入來源」(`/itinerary/[tripId]` server component 讀 DB)與「存檔出口」(`ItineraryClient` 可選 `tripId` + debounced autosave)。單一 Supabase Auth(Google 原生、LINE 自訂 OIDC);行程整包以 `PlanResult` JSONB 存,`last-write-wins`;擁有權由 Postgres RLS 強制(單一真相)。

**Tech Stack:** Next.js 14.2(App Router)、TypeScript strict、`@supabase/ssr` + `@supabase/supabase-js`、Supabase Postgres + RLS、Jest(ts-jest/jsdom)、Playwright。

**Spec:** `docs/superpowers/specs/2026-07-01-laneC-c1-auth-persistence-design.md`

## Global Constraints

- TypeScript strict,無 `any`(必要處用明確型別或 `unknown` 收斂)。
- UI 文案一律繁體中文(文案見 spec §5.5)。
- 不引入第二套 auth(NextAuth 等)——Google 走 Supabase 原生、LINE 走 Supabase 自訂 OIDC。
- `tripId` 為**可選** prop;匿名路徑(`/itinerary`)行為與既有測試零變更(零 fixture 遷移)。
- service-role key 僅可被 server 模組引用(`lib/supabase/admin.ts`),絕不進 client bundle。
- RLS 是擁有權的單一真相;server action 內**不**重複做擁有權判斷。
- 自動存檔為 `last-write-wins`(realtime/衝突解析屬 C5,不在本案)。
- ⚠️ Windows Jest 原生 binding:本機需該 binding 存在但**不可** commit(會破壞 Vercel/Linux 部署)。執行測試前若 `jest` 噴 binding 錯誤,先依專案記憶在本機補上,勿加入 git。

---

## File Structure

| 檔案 | 責任 |
|---|---|
| `lib/supabase/client.ts`(新) | browser client(`createBrowserClient`) |
| `lib/supabase/server.ts`(新) | server client(`createServerClient`,套 RLS) |
| `lib/supabase/admin.ts`(新) | service-role client(server only,繞過 RLS) |
| `middleware.ts`(新) | 每次請求刷新 Supabase session cookie |
| `supabase/migrations/0001_trips.sql`(新) | `trips` 表 + index + RLS 政策 |
| `app/actions/trips.ts`(新) | create/get/save/list/rename/delete server actions |
| `app/auth/callback/route.ts`(新) | OAuth code → session,redirect |
| `app/auth/signout/route.ts`(新) | 登出 |
| `app/login/page.tsx`(新) | Google / LINE 登入按鈕 |
| `app/trips/page.tsx`(新) | 我的行程(server,取資料) |
| `components/TripsView.tsx`(新) | 我的行程的純 UI + 改名/刪除互動(client) |
| `app/itinerary/[tripId]/page.tsx`(新) | 載入持久化 trip → 渲染 client |
| `components/HeaderView.tsx`(新) | header 純 UI(login 狀態) |
| `components/Header.tsx`(新) | header server 容器(取 user) |
| `app/itinerary/ItineraryClient.tsx`(改) | 可選 `tripId`、儲存按鈕、autosave、存檔狀態 |
| `lib/types.ts`(改) | 新增 `TripSummary` |
| `.env.local.example`(改) | 三個 Supabase 環境變數佔位 |

---

## Task 0(前置,非程式碼):外部服務設定

> 這不是 commit 任務,而是實作 Task 1+ 之前必須備妥的外部設定。若由 agent 執行,先向使用者確認以下皆已完成並取得金鑰。

- **Supabase 專案**:建立專案;記下 `Project URL`、`anon key`、`service_role key`。
- **Google OAuth**:Google Cloud 建 OAuth 2.0 client;Authorized redirect URI 填 `https://<project>.supabase.co/auth/v1/callback`;在 Supabase Auth → Providers → Google 填 client id/secret 並啟用。
- **LINE Login**:LINE Developers 建立 Provider + LINE Login channel;取得 Channel ID / Channel secret;在 Supabase Auth 以 **Custom OIDC Provider** 設定(issuer `https://access.line.me`,client id = Channel ID,secret = Channel secret,scopes `openid profile`);記下 Supabase 配給此自訂 provider 的 **provider slug**(Task 4 的 LINE 按鈕要用)。
- **環境變數**:於 `.env.local`(本機)與 Vercel(部署)設定三個 key(見 Task 1)。

---

## Task 1: Supabase clients、deps、環境變數

**Files:**
- Modify: `package.json`(deps)
- Create: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`
- Modify: `.env.local.example`
- Test: `__tests__/supabase-client.test.ts`

**Interfaces:**
- Produces:
  - `lib/supabase/client.ts` → `export function createClient(): SupabaseClient`(browser)
  - `lib/supabase/server.ts` → `export function createClient(): SupabaseClient`(server,讀 next cookies)
  - `lib/supabase/admin.ts` → `export function createAdminClient(): SupabaseClient`(service-role)

- [ ] **Step 1: 安裝依賴**

Run:
```bash
npm install @supabase/ssr @supabase/supabase-js
```
Expected: `package.json` dependencies 出現兩者;`package-lock.json` 更新。

- [ ] **Step 2: 補環境變數佔位**

Edit `.env.local.example`,追加:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```
並在本機 `.env.local` 填入 Task 0 取得的真實值。

- [ ] **Step 3: 寫失敗測試(browser client 用 env 建構)**

Create `__tests__/supabase-client.test.ts`:
```ts
const createBrowserClient = jest.fn(() => ({ __kind: 'browser' }))
jest.mock('@supabase/ssr', () => ({ createBrowserClient: (...a: unknown[]) => createBrowserClient(...a) }))

describe('browser supabase client', () => {
  beforeEach(() => {
    createBrowserClient.mockClear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('constructs the browser client with url + anon key', () => {
    const { createClient } = require('@/lib/supabase/client')
    createClient()
    expect(createBrowserClient).toHaveBeenCalledWith('https://x.supabase.co', 'anon-key')
  })
})
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `npm test -- supabase-client`
Expected: FAIL(`Cannot find module '@/lib/supabase/client'`)。

- [ ] **Step 5: 實作三個 client**

Create `lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

Create `lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // 在 Server Component 內被呼叫時 cookie 唯讀；交由 middleware 刷新。
          }
        },
      },
    },
  )
}
```

Create `lib/supabase/admin.ts`:
```ts
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```
> `import 'server-only'` 確保此模組被 client bundle 引入時建置即報錯,保護 service-role key。需 `npm install server-only`(Next 內建,通常已存在;若無則安裝)。

- [ ] **Step 6: 跑測試確認通過**

Run: `npm test -- supabase-client`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .env.local.example lib/supabase __tests__/supabase-client.test.ts
git commit -m "feat(laneC): supabase browser/server/admin clients + env scaffolding"
```

---

## Task 2: `trips` 資料表 + RLS migration

**Files:**
- Create: `supabase/migrations/0001_trips.sql`

**Interfaces:**
- Produces: `public.trips(id uuid, owner_id uuid, title text, plan jsonb, created_at, updated_at)` + owner-only RLS。後續 server actions 依賴此 schema 與政策。

> SQL/RLS 無法用 Jest 做 TDD;本任務的驗證 = 套用 migration 後跑提供的 SQL 斷言(兩個使用者互不可見)。

- [ ] **Step 1: 撰寫 migration**

Create `supabase/migrations/0001_trips.sql`:
```sql
-- Lane C / C1: trips table + owner-only RLS
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  title       text not null default '未命名行程',
  plan        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists trips_owner_id_idx on public.trips(owner_id);

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

- [ ] **Step 2: 套用 migration**

於 Supabase 專案套用(擇一):
- Dashboard → SQL Editor 貼上執行;或
- 安裝 Supabase CLI 後 `supabase db push`(若採用本機 `supabase start` 開發)。

Expected: `trips` 表建立、RLS enabled、四條政策存在。

- [ ] **Step 3: 驗證 RLS(手動 SQL 斷言)**

在 SQL Editor 以兩個測試使用者 id 驗證(或用 Dashboard 兩個帳號實測):
```sql
-- 以使用者 A 身分插入一列後,使用者 B 不應 select 得到該列。
-- 期望:set role / jwt claim 為 B 時,select * from trips 回 0 列。
```
Expected:非 owner 的 select/update/delete 皆回 0 列 / 被擋。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0001_trips.sql
git commit -m "feat(laneC): trips table + owner-only RLS migration"
```

---

## Task 3: trips server actions

**Files:**
- Create: `app/actions/trips.ts`
- Modify: `lib/types.ts`(新增 `TripSummary`)
- Test: `__tests__/trips-actions.test.ts`

**Interfaces:**
- Consumes: `lib/supabase/server.ts` 的 `createClient()`。
- Produces:
```ts
interface TripSummary { id: string; title: string; updatedAt: string }
createTrip(plan: PlanResult, title: string): Promise<{ tripId: string }>
getTrip(tripId: string): Promise<{ plan: PlanResult; title: string } | null>
saveTrip(tripId: string, plan: PlanResult): Promise<void>
listTrips(): Promise<TripSummary[]>
renameTrip(tripId: string, title: string): Promise<void>
deleteTrip(tripId: string): Promise<void>
```

- [ ] **Step 1: 新增型別**

Edit `lib/types.ts`,於檔末追加:
```ts
export interface TripSummary {
  id: string
  title: string
  updatedAt: string   // ISO
}
```

- [ ] **Step 2: 寫失敗測試**

Create `__tests__/trips-actions.test.ts`:
```ts
import type { PlanResult } from '@/lib/types'

// 可鏈式呼叫的 Supabase mock builder
function makeSupabase(overrides: {
  user?: { id: string } | null
  single?: { data: unknown; error: unknown }
  list?: { data: unknown; error: unknown }
  mutate?: { error: unknown }
} = {}) {
  const single = jest.fn(async () => overrides.single ?? { data: { id: 't1' }, error: null })
  const order = jest.fn(async () => overrides.list ?? { data: [], error: null })
  const eqMutate = jest.fn(async () => overrides.mutate ?? { error: null })

  const builder: any = {
    insert: jest.fn(() => builder),
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => ({ ...builder, single, then: (r: any) => eqMutate().then(r) })),
    order,
    single,
  }
  // delete().eq() 與 update().eq() 需 await 回 { error }
  builder.eq = jest.fn(() => Object.assign(eqMutate(), { single }))
  return {
    client: {
      from: jest.fn(() => builder),
      auth: { getUser: jest.fn(async () => ({ data: { user: overrides.user ?? { id: 'u1' } } })) },
    },
    spies: { single, order, eqMutate, builder },
  }
}

let current: ReturnType<typeof makeSupabase>
jest.mock('@/lib/supabase/server', () => ({ createClient: () => current.client }))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' } as PlanResult

beforeEach(() => { current = makeSupabase() })

it('createTrip inserts owner_id + plan and returns the new id', async () => {
  current = makeSupabase({ user: { id: 'u1' }, single: { data: { id: 'new-id' }, error: null } })
  const { createTrip } = require('@/app/actions/trips')
  const out = await createTrip(plan, '東京三日')
  expect(out).toEqual({ tripId: 'new-id' })
  expect(current.client.from).toHaveBeenCalledWith('trips')
})

it('createTrip throws NOT_AUTHENTICATED when no user', async () => {
  current = makeSupabase({ user: null })
  const { createTrip } = require('@/app/actions/trips')
  await expect(createTrip(plan, 't')).rejects.toThrow('NOT_AUTHENTICATED')
})

it('getTrip returns null on error', async () => {
  current = makeSupabase({ single: { data: null, error: { message: 'no' } } })
  const { getTrip } = require('@/app/actions/trips')
  expect(await getTrip('x')).toBeNull()
})

it('getTrip maps plan + title on success', async () => {
  current = makeSupabase({ single: { data: { plan, title: '東京' }, error: null } })
  const { getTrip } = require('@/app/actions/trips')
  expect(await getTrip('t1')).toEqual({ plan, title: '東京' })
})

it('listTrips maps rows to TripSummary', async () => {
  current = makeSupabase({ list: { data: [{ id: 'a', title: 'A', updated_at: '2026-07-01T00:00:00Z' }], error: null } })
  const { listTrips } = require('@/app/actions/trips')
  expect(await listTrips()).toEqual([{ id: 'a', title: 'A', updatedAt: '2026-07-01T00:00:00Z' }])
})

it('saveTrip throws a zh error when update fails', async () => {
  current = makeSupabase({ mutate: { error: { message: 'boom' } } })
  const { saveTrip } = require('@/app/actions/trips')
  await expect(saveTrip('t1', plan)).rejects.toThrow('儲存失敗，請稍後再試')
})
```
> 註:`makeSupabase` 的鏈式 mock 較精巧。若實作時鏈結形狀對不上,**以行為為準調整 mock**(目標是斷言 action 對 `from('trips')` 的 insert/select/update/delete/eq 呼叫與回傳對映),勿改 action 去遷就 mock。

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm test -- trips-actions`
Expected: FAIL(`Cannot find module '@/app/actions/trips'`)。

- [ ] **Step 4: 實作 server actions**

Create `app/actions/trips.ts`:
```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import type { PlanResult, TripSummary } from '@/lib/types'

export async function createTrip(plan: PlanResult, title: string): Promise<{ tripId: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { data, error } = await supabase
    .from('trips')
    .insert({ owner_id: user.id, title, plan })
    .select('id')
    .single()
  if (error || !data) throw new Error('儲存失敗，請稍後再試')
  return { tripId: (data as { id: string }).id }
}

export async function getTrip(tripId: string): Promise<{ plan: PlanResult; title: string } | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trips')
    .select('plan, title')
    .eq('id', tripId)
    .single()
  if (error || !data) return null
  const row = data as { plan: PlanResult; title: string }
  return { plan: row.plan, title: row.title }
}

export async function saveTrip(tripId: string, plan: PlanResult): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('trips')
    .update({ plan, updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (error) throw new Error('儲存失敗，請稍後再試')
}

export async function listTrips(): Promise<TripSummary[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trips')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  return (data as { id: string; title: string; updated_at: string }[]).map((r) => ({
    id: r.id, title: r.title, updatedAt: r.updated_at,
  }))
}

export async function renameTrip(tripId: string, title: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('trips').update({ title }).eq('id', tripId)
  if (error) throw new Error('改名失敗，請稍後再試')
}

export async function deleteTrip(tripId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) throw new Error('刪除失敗，請稍後再試')
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm test -- trips-actions`
Expected: PASS(若鏈式 mock 需微調,依 Step 2 註記調整測試,勿改 action)。

- [ ] **Step 6: Commit**

```bash
git add app/actions/trips.ts lib/types.ts __tests__/trips-actions.test.ts
git commit -m "feat(laneC): trips server actions (create/get/save/list/rename/delete)"
```

---

## Task 4: 認證流程(login 頁、callback、登出、middleware)

**Files:**
- Create: `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/auth/signout/route.ts`, `middleware.ts`
- Test: `__tests__/login-page.test.tsx`

**Interfaces:**
- Consumes: `lib/supabase/client.ts`(login 按鈕)、`lib/supabase/server.ts`(callback/signout)。
- Produces: `/login`(可帶 `?next=`)、`/auth/callback`(code→session)、`/auth/signout`、全站 session 刷新 middleware。

- [ ] **Step 1: 寫失敗測試(login 頁兩顆按鈕呼叫對的 provider)**

Create `__tests__/login-page.test.tsx`:
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

const signInWithOAuth = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a) } }),
}))
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('next=/trips'),
}))

beforeEach(() => { signInWithOAuth.mockClear() })

it('renders Google + LINE buttons', () => {
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  expect(screen.getByRole('button', { name: '使用 Google 登入' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '使用 LINE 登入' })).toBeInTheDocument()
})

it('Google button calls signInWithOAuth with provider google', () => {
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: '使用 Google 登入' }))
  expect(signInWithOAuth).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'google' }),
  )
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- login-page`
Expected: FAIL(`Cannot find module '@/app/login/page'`)。

- [ ] **Step 3: 實作 login 頁**

Create `app/login/page.tsx`:
```tsx
'use client'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// LINE 在 Supabase 為自訂 OIDC provider;此 slug 需與 Dashboard 設定一致(見 plan Task 0)。
const LINE_PROVIDER = 'line' as const

export default function LoginPage() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/trips'
  const supabase = createClient()

  function signIn(provider: 'google' | typeof LINE_PROVIDER) {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo } })
  }

  return (
    <main className="max-w-sm mx-auto px-4 py-16 flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-center">登入以儲存行程</h1>
      <button
        onClick={() => signIn('google')}
        className="border rounded-md py-2 hover:bg-gray-50"
      >
        使用 Google 登入
      </button>
      <button
        onClick={() => signIn(LINE_PROVIDER)}
        className="border rounded-md py-2 hover:bg-gray-50"
      >
        使用 LINE 登入
      </button>
    </main>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- login-page`
Expected: PASS。

- [ ] **Step 5: 實作 callback route**

Create `app/auth/callback/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/trips'
  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
```

- [ ] **Step 6: 實作登出 route**

Create `app/auth/signout/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  const supabase = createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(`${origin}/`, { status: 303 })
}
```

- [ ] **Step 7: 實作 session 刷新 middleware**

Create `middleware.ts`(repo 根目錄):
```ts
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )
  await supabase.auth.getUser()
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

- [ ] **Step 8: 手動驗證 OAuth 來回**

Run: `npm run dev`,開 `/login`,各點 Google / LINE 完成登入。
Expected: 導回 `/auth/callback` 後再導到 `/trips`;Supabase Dashboard → Authentication → Users 出現該使用者。

- [ ] **Step 9: Commit**

```bash
git add app/login app/auth middleware.ts __tests__/login-page.test.tsx
git commit -m "feat(laneC): google+line login page, oauth callback, signout, session middleware"
```

---

## Task 5: Header 登入狀態

**Files:**
- Create: `components/HeaderView.tsx`(純 UI,client)、`components/Header.tsx`(server 容器)
- Modify: `app/layout.tsx`(掛上 `<Header />`)
- Test: `__tests__/header-view.test.tsx`

**Interfaces:**
- Consumes: `lib/supabase/server.ts`(`Header` 取 user)。
- Produces: `HeaderView({ user })`,`user: { name: string; avatarUrl: string | null } | null`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/header-view.test.tsx`:
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { HeaderView } from '@/components/HeaderView'

it('shows 登入 link when no user', () => {
  render(<HeaderView user={null} />)
  expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login')
})

it('shows name, 我的行程, 登出 when logged in', () => {
  render(<HeaderView user={{ name: '小明', avatarUrl: null }} />)
  expect(screen.getByText('小明')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '我的行程' })).toHaveAttribute('href', '/trips')
  expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- header-view`
Expected: FAIL。

- [ ] **Step 3: 實作 HeaderView(純 UI)**

Create `components/HeaderView.tsx`:
```tsx
import Link from 'next/link'

interface Props {
  user: { name: string; avatarUrl: string | null } | null
}

export function HeaderView({ user }: Props) {
  return (
    <header className="border-b px-4 py-2 flex items-center justify-between">
      <Link href="/" className="font-semibold">行程規劃</Link>
      {user ? (
        <div className="flex items-center gap-3 text-sm">
          <Link href="/trips" className="hover:underline">我的行程</Link>
          <span className="text-gray-700">{user.name}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="hover:underline">登出</button>
          </form>
        </div>
      ) : (
        <Link href="/login" className="text-sm hover:underline">登入</Link>
      )}
    </header>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- header-view`
Expected: PASS。

- [ ] **Step 5: 實作 Header server 容器並掛上 layout**

Create `components/Header.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { HeaderView } from './HeaderView'

export async function Header() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const view = user
    ? {
        name:
          (user.user_metadata?.name as string | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          user.email ??
          '使用者',
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      }
    : null
  return <HeaderView user={view} />
}
```

Edit `app/layout.tsx`:在 `<body>` 最上方插入 `<Header />`(import `{ Header } from '@/components/Header'`,並把 body children 包在其後)。`Header` 為 async server component,可直接於 layout 內 `await` 渲染。

- [ ] **Step 6: 跑全測試**

Run: `npm test`
Expected: 既有測試 + 新測試全綠。

- [ ] **Step 7: Commit**

```bash
git add components/Header.tsx components/HeaderView.tsx app/layout.tsx __tests__/header-view.test.tsx
git commit -m "feat(laneC): header with login state, 我的行程, signout"
```

---

## Task 6: ItineraryClient — 儲存按鈕、autosave、存檔狀態

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx`
- Test: `__tests__/itinerary-client-save.test.tsx`

**Interfaces:**
- Consumes: `app/actions/trips.ts` 的 `createTrip`, `saveTrip`;`next/navigation` 的 `useRouter`。
- Produces: `ItineraryClient({ initial, tripId? })`;`tripId` 未定義 = 匿名(顯示「儲存行程」),有值 = 持久化(autosave + 存檔狀態)。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/itinerary-client-save.test.tsx`(沿用 `itinerary-client-smart-arrange.test.tsx` 的 dnd/元件 mock 樣板;以下只列本任務新增重點):
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const createTrip = jest.fn()
const saveTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({
  createTrip: (...a: unknown[]) => createTrip(...a),
  saveTrip: (...a: unknown[]) => saveTrip(...a),
}))
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// ...（複製 smart-arrange 測試的 @dnd-kit / RecommendPanel / CombinedInput / clientScheduler mock）
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'
// ...（複製其 sp() 與 plan() helper）

beforeEach(() => { createTrip.mockReset(); saveTrip.mockReset(); push.mockReset() })

it('anon mode: 儲存行程 click creates trip then routes to /itinerary/<id>', async () => {
  createTrip.mockResolvedValue({ tripId: 't1' })
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '儲存行程' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/itinerary/t1'))
})

it('anon mode: NOT_AUTHENTICATED routes to /login?next=/itinerary', async () => {
  createTrip.mockRejectedValue(new Error('NOT_AUTHENTICATED'))
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '儲存行程' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/login?next=%2Fitinerary'))
})

it('persistent mode: shows 已儲存 after an autosave succeeds', async () => {
  jest.useFakeTimers()
  saveTrip.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" />)
  // 觸發一次編輯（例如某個會改 plan 的既有控制）→ 等 autosave debounce
  // 簡化：直接前進計時器讓初始 dirty=false→编辑後 true→存檔
  act(() => { jest.advanceTimersByTime(2000) })
  await waitFor(() => expect(screen.queryByText('儲存中…')).not.toBeInTheDocument())
  jest.useRealTimers()
})
```
> 註:persistent autosave 測試需先製造一次 plan 變更。可在 render 後透過任一既有會改動 `plan` 的 UI(如鎖定按鈕)觸發,再 advance timers 斷言 `saveTrip` 被呼叫且狀態轉「已儲存」。實作測試時挑一個 smart-arrange 測試已驗證可點的控制即可。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- itinerary-client-save`
Expected: FAIL(`儲存行程` 按鈕不存在 / `useRouter` 未使用)。

- [ ] **Step 3: 改 ItineraryClient**

於 `app/itinerary/ItineraryClient.tsx`:

(a) imports 追加:
```ts
import { useRouter } from 'next/navigation'
import { createTrip, saveTrip } from '@/app/actions/trips'
```

(b) `Props` 改為:
```ts
interface Props {
  initial: PlanResult
  tripId?: string
}
export function ItineraryClient({ initial, tripId }: Props) {
```

(c) 元件內新增 state / refs / handler(放在既有 state 宣告附近):
```ts
const router = useRouter()
const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

// 匿名：建立 trip
const onSave = useCallback(async () => {
  try {
    const { tripId: newId } = await createTrip(planRef.current, '未命名行程')
    router.push(`/itinerary/${newId}`)
  } catch (e) {
    if (e instanceof Error && e.message === 'NOT_AUTHENTICATED') {
      router.push(`/login?next=${encodeURIComponent('/itinerary')}`)
    } else {
      setSaveState('error')
    }
  }
}, [router])

// 持久化：plan 變動 → debounced autosave（last-write-wins）
useEffect(() => {
  if (!tripId) return
  if (plan === savedPlanRef.current) return
  setSaveState('saving')
  if (autosaveRef.current) clearTimeout(autosaveRef.current)
  autosaveRef.current = setTimeout(async () => {
    try {
      await saveTrip(tripId, planRef.current)
      savedPlanRef.current = planRef.current
      setSaveState('saved')
    } catch {
      setSaveState('error')
    }
  }, 1500)
  return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current) }
}, [plan, tripId])
```
> `planRef` / `savedPlanRef` 已存在於檔案(見現有 L54–55);此處改為 autosave 的 dirty 基準。

(d) JSX:在頁面標頭區插入存檔 UI:
```tsx
{tripId ? (
  <span className="text-sm text-gray-500">
    {saveState === 'saving' && '儲存中…'}
    {saveState === 'saved' && '已儲存'}
    {saveState === 'error' && (
      <button onClick={() => { setSaveState('saving'); savedPlanRef.current = {} as PlanResult }} className="text-red-600 underline">
        儲存失敗，點此重試
      </button>
    )}
  </span>
) : (
  <button onClick={onSave} className="text-sm border rounded px-3 py-1 hover:bg-gray-50">
    儲存行程
  </button>
)}
```
> 重試做法:把 `savedPlanRef` 設為不等於目前 plan 的哨兵,使 autosave effect 重新觸發。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- itinerary-client-save`
Expected: PASS。

- [ ] **Step 5: 跑全測試(確認匿名路徑零回歸)**

Run: `npm test`
Expected: 既有 ItineraryClient 測試(smart-arrange、leg 等)全綠。

- [ ] **Step 6: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx __tests__/itinerary-client-save.test.tsx
git commit -m "feat(laneC): ItineraryClient save button + debounced autosave + save status"
```

---

## Task 7: 持久化路由 `/itinerary/[tripId]`

**Files:**
- Create: `app/itinerary/[tripId]/page.tsx`
- Test: `__tests__/trip-page.test.tsx`

**Interfaces:**
- Consumes: `app/actions/trips.ts` 的 `getTrip`;`app/itinerary/ItineraryClient.tsx`。
- Produces: server route,`getTrip` 為 null → `notFound()`;否則渲染 `<ItineraryClient initial={plan} tripId={...} />`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/trip-page.test.tsx`:
```tsx
const getTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({ getTrip: (...a: unknown[]) => getTrip(...a) }))
const notFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND') })
jest.mock('next/navigation', () => ({ notFound: () => notFound() }))
jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: (props: { tripId?: string }) => null && props,
}))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' }

beforeEach(() => { getTrip.mockReset(); notFound.mockClear() })

it('calls notFound when trip is missing', async () => {
  getTrip.mockResolvedValue(null)
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  await expect(TripPage({ params: { tripId: 'x' } })).rejects.toThrow('NEXT_NOT_FOUND')
})

it('renders ItineraryClient with tripId + plan when found', async () => {
  getTrip.mockResolvedValue({ plan, title: '東京' })
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 't1' } })
  expect(el.props.tripId).toBe('t1')
  expect(el.props.initial).toEqual(plan)
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- trip-page`
Expected: FAIL(模組不存在)。

- [ ] **Step 3: 實作路由**

Create `app/itinerary/[tripId]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { getTrip } from '@/app/actions/trips'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

export default async function TripPage({ params }: { params: { tripId: string } }) {
  const trip = await getTrip(params.tripId)
  if (!trip) notFound()
  return <ItineraryClient initial={trip.plan} tripId={params.tripId} />
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- trip-page`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add "app/itinerary/[tripId]/page.tsx" __tests__/trip-page.test.tsx
git commit -m "feat(laneC): persistent /itinerary/[tripId] route loads trip from supabase"
```

---

## Task 8: `/trips` 我的行程清單(含改名 / 刪除)

**Files:**
- Create: `app/trips/page.tsx`(server)、`components/TripsView.tsx`(client)
- Test: `__tests__/trips-view.test.tsx`

**Interfaces:**
- Consumes: `app/actions/trips.ts` 的 `listTrips`(page)、`renameTrip`/`deleteTrip`(view)。
- Produces: `TripsView({ trips })`,`trips: TripSummary[]`。

- [ ] **Step 1: 寫失敗測試**

Create `__tests__/trips-view.test.tsx`:
```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const renameTrip = jest.fn()
const deleteTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({
  renameTrip: (...a: unknown[]) => renameTrip(...a),
  deleteTrip: (...a: unknown[]) => deleteTrip(...a),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
import { TripsView } from '@/components/TripsView'

const trips = [{ id: 'a', title: '東京三日', updatedAt: '2026-07-01T00:00:00Z' }]

beforeEach(() => { renameTrip.mockReset(); deleteTrip.mockReset() })

it('shows empty state when no trips', () => {
  render(<TripsView trips={[]} />)
  expect(screen.getByText('還沒有儲存的行程,從首頁建立一個吧')).toBeInTheDocument()
})

it('lists trips with an open link', () => {
  render(<TripsView trips={trips} />)
  expect(screen.getByRole('link', { name: '東京三日' })).toHaveAttribute('href', '/itinerary/a')
})

it('delete calls deleteTrip', async () => {
  deleteTrip.mockResolvedValue(undefined)
  render(<TripsView trips={trips} />)
  fireEvent.click(screen.getByRole('button', { name: '刪除' }))
  await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith('a'))
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm test -- trips-view`
Expected: FAIL。

- [ ] **Step 3: 實作 TripsView**

Create `components/TripsView.tsx`:
```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TripSummary } from '@/lib/types'
import { renameTrip, deleteTrip } from '@/app/actions/trips'

export function TripsView({ trips }: { trips: TripSummary[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  if (trips.length === 0) {
    return <p className="text-gray-500 px-4 py-10">還沒有儲存的行程,從首頁建立一個吧</p>
  }

  async function onRename(id: string, current: string) {
    const next = window.prompt('新名稱', current)
    if (!next || next === current) return
    setBusy(id)
    try { await renameTrip(id, next); router.refresh() } finally { setBusy(null) }
  }
  async function onDelete(id: string) {
    if (!window.confirm('確定刪除這個行程?')) return
    setBusy(id)
    try { await deleteTrip(id); router.refresh() } finally { setBusy(null) }
  }

  return (
    <ul className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-2">
      {trips.map((t) => (
        <li key={t.id} className="border rounded-md px-4 py-3 flex items-center justify-between">
          <Link href={`/itinerary/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400">{t.updatedAt.slice(0, 10)}</span>
            <button onClick={() => onRename(t.id, t.title)} disabled={busy === t.id} className="hover:underline">改名</button>
            <button onClick={() => onDelete(t.id)} disabled={busy === t.id} className="text-red-600 hover:underline">刪除</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm test -- trips-view`
Expected: PASS。

- [ ] **Step 5: 實作 server page**

Create `app/trips/page.tsx`:
```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listTrips } from '@/app/actions/trips'
import { TripsView } from '@/components/TripsView'

export default async function TripsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/trips')
  const trips = await listTrips()
  return (
    <main>
      <h1 className="max-w-2xl mx-auto px-4 pt-8 text-xl font-semibold">我的行程</h1>
      <TripsView trips={trips} />
    </main>
  )
}
```

- [ ] **Step 6: 跑全測試**

Run: `npm test`
Expected: 全綠。

- [ ] **Step 7: Commit**

```bash
git add app/trips/page.tsx components/TripsView.tsx __tests__/trips-view.test.tsx
git commit -m "feat(laneC): /trips list page with rename + delete"
```

---

## Task 9: e2e(Playwright)— 持久化來回 + RLS

**Files:**
- Create: `e2e/laneC-persistence.spec.ts`

> OAuth 在 e2e 不易自動化。本任務聚焦「**已登入 session 下**」的持久化與 RLS;登入以注入 Supabase session cookie 或既有測試帳號完成(見 Step 1 註)。若環境無法注入 session,將標記為 `test.skip` 並於 PR 描述列為手動驗證項。

- [ ] **Step 1: 寫 e2e**

Create `e2e/laneC-persistence.spec.ts`:
```ts
import { test, expect } from '@playwright/test'

// 前置:以測試帳號取得 Supabase session 並注入 cookie。
// 作法擇一:(a) 用 service-role admin 產生 magic-link session 後 setCookie;
//          (b) storageState 預先登入。無法注入時 test.skip。
test.describe('Lane C 持久化', () => {
  test('儲存後重整,行程仍在', async ({ page }) => {
    // 1. 從首頁建立一個含 ≥2 地點的行程 → /itinerary
    // 2. 點「儲存行程」→ 導向 /itinerary/<id>
    // 3. reload → 卡片仍在、存檔狀態為「已儲存」
    await page.goto('/')
    // ...（沿用既有 e2e 建立行程的步驟）
    // await page.getByRole('button', { name: '儲存行程' }).click()
    // await expect(page).toHaveURL(/\/itinerary\/.+/)
    // await page.reload()
    // await expect(page.getByText('已儲存')).toBeVisible()
  })

  test('他人的 tripId 回 not found', async ({ page }) => {
    await page.goto('/itinerary/00000000-0000-0000-0000-000000000000')
    await expect(page.getByText(/404|找不到/)).toBeVisible()
  })
})
```

- [ ] **Step 2: 跑 e2e**

Run: `npm run e2e -- laneC-persistence`
Expected: 通過(或在無法注入 session 時 skip,並於 PR 註記手動驗證)。

- [ ] **Step 3: Commit**

```bash
git add e2e/laneC-persistence.spec.ts
git commit -m "test(laneC): e2e persistence round-trip + RLS not-found"
```

---

## Task 10: 收尾 — Lane C roadmap 記錄 + 全測試

**Files:**
- Create: `docs/superpowers/specs/2026-07-01-laneC-roadmap.md`(精簡:列 C1–C5 與狀態)

- [ ] **Step 1: 寫 Lane C roadmap 摘要**

Create `docs/superpowers/specs/2026-07-01-laneC-roadmap.md`,記錄脊椎 C1–C5、依賴、與 C1 已完成狀態(內容見本 plan §0 與 spec §0)。

- [ ] **Step 2: 全測試 + lint + build**

Run:
```bash
npm test && npm run lint && npm run build
```
Expected:全綠、無 type error、build 成功。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-01-laneC-roadmap.md
git commit -m "docs(laneC): record Lane C roadmap (C1 done, C2-C5 pending)"
```

---

## Self-Review(對照 spec)

**Spec coverage:**
- spec §1 身份 → Task 1(clients)、Task 4(login/callback/middleware)✅
- spec §1 持久化 → Task 2(schema)、Task 3(actions)、Task 7(載入路由)、Task 6(autosave)✅
- spec §1 擁有權 / RLS → Task 2(政策)、Task 9(RLS e2e)✅
- spec §2.2 儲存流程 → Task 6(儲存按鈕 + 未登入導向)✅
- spec §2.3 持久化編輯 autosave → Task 6 ✅
- spec §2.4 我的行程 / header → Task 8、Task 5 ✅
- spec §3.1 三個 client → Task 1 ✅
- spec §3.2 認證(含 LINE 自訂 OIDC seam)→ Task 4 ✅
- spec §3.3 server actions(6 個)→ Task 3 ✅
- spec §3.4 ItineraryClient 可選 tripId + autosave + dirty → Task 6 ✅
- spec §3.5 路由(/itinerary/[tripId]、/login、/trips、callback)→ Tasks 4/7/8 ✅
- spec §4 schema + RLS + TripSummary → Tasks 2/3 ✅
- spec §7 錯誤處理(未登入儲存、notFound、autosave 失敗、service-role 防護)→ Tasks 3/6/7 + Task 1 `server-only` ✅
- spec §8 測試(unit/整合/e2e/RLS)→ Tasks 3/5/6/7/8/9 ✅
- spec §10 外部前置 → Task 0 ✅

**Placeholder scan:** e2e(Task 9)刻意保留步驟註解,因 OAuth session 注入依環境而定,已明確標示為「沿用既有 e2e 建立行程步驟 / 無法注入則 skip + 手動驗證」——非 TBD,而是環境相依的執行指引。其餘任務皆含完整可執行碼。

**Type consistency:** `createClient`(client/server 同名不同檔,分別 import)、`createAdminClient`、`TripSummary {id,title,updatedAt}`、`createTrip→{tripId}`、`getTrip→{plan,title}|null`、`ItineraryClient({initial,tripId?})` 跨任務一致。
