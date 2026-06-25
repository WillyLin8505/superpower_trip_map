# Vercel Deploy + Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix one deploy blocker, one security issue, one data integrity bug, one missing guard, and one UX gap so the app runs correctly on Vercel.

**Architecture:** Replace the Claude CLI subprocess with a direct Anthropic SDK call; proxy photo requests through a Next.js API route to keep the Google API key server-side; move the places payload from URL params to sessionStorage to avoid length limits; add a client-side redirect guard for empty sessions; auto-fetch recommendations on mount.

**Tech Stack:** Next.js 14 (App Router), TypeScript, `@anthropic-ai/sdk`, Jest + Testing Library

## Global Constraints

- Next.js 14 App Router — file-based routing, `'use server'` / `'use client'` directives required
- All new API keys consumed only server-side (never in `NEXT_PUBLIC_*` variables)
- Model for Claude calls: `claude-haiku-4-5-20251001`
- `max_tokens: 1024` for all Claude calls
- TypeScript strict mode — no `any`, no type assertions without reason
- Test files live in `__tests__/` using `.test.ts` or `.test.tsx` extension
- Use `/** @jest-environment jsdom */` at top of any test file that needs browser APIs
- No new UI libraries — use existing Tailwind classes

---

## Task 1: Claude SDK Migration

**Files:**
- Modify: `lib/claude.ts` (full rewrite)
- Create: `__tests__/claude.test.ts`

**Interfaces:**
- Produces: `callClaude(prompt: string): Promise<string>` — identical signature to current; all callers (`app/actions/recommend.ts`, `app/actions/ai.ts`) require no changes

- [ ] **Step 1: Install the Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

Expected: `@anthropic-ai/sdk` appears in `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `__tests__/claude.test.ts`:

```typescript
import { callClaude } from '@/lib/claude'

// Mock the Anthropic SDK before importing
jest.mock('@anthropic-ai/sdk', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'mock response' }],
        }),
      },
    })),
  }
})

import Anthropic from '@anthropic-ai/sdk'

describe('callClaude', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns text content from the API response', async () => {
    const result = await callClaude('hello')
    expect(result).toBe('mock response')
  })

  it('calls the API with the correct model', async () => {
    await callClaude('test prompt')
    const instance = (Anthropic as jest.Mock).mock.results[0].value
    expect(instance.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-haiku-4-5-20251001' })
    )
  })

  it('passes the prompt as a user message', async () => {
    await callClaude('my prompt')
    const instance = (Anthropic as jest.Mock).mock.results[0].value
    expect(instance.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: 'my prompt' }],
      })
    )
  })

  it('throws if the API returns a non-text content block', async () => {
    const instance = (Anthropic as jest.Mock).mock.results[0].value
    instance.messages.create.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'x', name: 'x', input: {} }],
    })
    await expect(callClaude('x')).rejects.toThrow('unexpected content type')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx jest __tests__/claude.test.ts --no-coverage
```

Expected: FAIL — `callClaude` still uses `spawn`, mock has no effect yet.

- [ ] **Step 4: Rewrite `lib/claude.ts`**

Replace the entire file:

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function callClaude(prompt: string): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('unexpected content type')
  return block.text
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest __tests__/claude.test.ts --no-coverage
```

Expected: PASS — 4 tests passing.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add lib/claude.ts __tests__/claude.test.ts package.json package-lock.json
git commit -m "feat: replace Claude CLI spawn with Anthropic SDK"
```

---

## Task 2: Photo Proxy Route

**Files:**
- Create: `app/api/photo/route.ts`
- Modify: `app/actions/places.ts` — line 29–31 (photoUrl builder)
- Create: `__tests__/photo-route.test.ts`

**Interfaces:**
- Consumes: `GOOGLE_MAPS_API_KEY` env var (server-side only)
- Produces: `GET /api/photo?ref=<photo_reference>` — returns the image bytes with correct `content-type` header
- `places.ts` photoUrl field changes from `https://maps.googleapis.com/...&key=...` to `/api/photo?ref=<photo_reference>`

- [ ] **Step 1: Write the failing test**

Create `__tests__/photo-route.test.ts`:

```typescript
import { GET } from '@/app/api/photo/route'
import { NextRequest } from 'next/server'

global.fetch = jest.fn()

describe('GET /api/photo', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when ref param is missing', async () => {
    const req = new NextRequest('http://localhost/api/photo')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('fetches from Google with the server API key and returns the image', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    const fakeImage = new ArrayBuffer(4)
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => fakeImage,
    })

    const req = new NextRequest('http://localhost/api/photo?ref=ABC123')
    const res = await GET(req)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('photo_reference=ABC123')
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('key=test-key')
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })

  it('returns 502 when Google fetch fails', async () => {
    ;(fetch as jest.Mock).mockResolvedValueOnce({ ok: false })
    const req = new NextRequest('http://localhost/api/photo?ref=BAD')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest __tests__/photo-route.test.ts --no-coverage
```

Expected: FAIL — route file does not exist yet.

- [ ] **Step 3: Create the photo proxy route**

Create `app/api/photo/route.ts`:

```typescript
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) return new Response('missing ref', { status: 400 })

  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=400&photo_reference=${ref}&key=${process.env.GOOGLE_MAPS_API_KEY}`

  const upstream = await fetch(url)
  if (!upstream.ok) return new Response('failed to fetch photo', { status: 502 })

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const body = await upstream.arrayBuffer()

  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=86400',
    },
  })
}
```

- [ ] **Step 4: Update the photoUrl builder in `app/actions/places.ts`**

Replace lines 29–31:

```typescript
// Before:
photoUrl: r.photos?.[0]
  ? `${BASE}/photo?maxwidth=400&photo_reference=${r.photos[0].photo_reference}&key=${KEY}`
  : null,

// After:
photoUrl: r.photos?.[0]
  ? `/api/photo?ref=${r.photos[0].photo_reference}`
  : null,
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest __tests__/photo-route.test.ts --no-coverage
```

Expected: PASS — 3 tests passing.

- [ ] **Step 6: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/api/photo/route.ts app/actions/places.ts __tests__/photo-route.test.ts
git commit -m "feat: proxy photo requests server-side to protect API key"
```

---

## Task 3: sessionStorage Places Handoff + Empty Guard

**Files:**
- Modify: `app/page.tsx` — `handleSubmit` function
- Modify: `app/itinerary/page.tsx` — convert to client component
- Create: `__tests__/itinerary-session.test.tsx`

**Interfaces:**
- Consumes: `planItinerary(places: Place[], days: number, mode: TransportMode): Promise<PlanResult>` from `app/actions/plan`
- `sessionStorage` key: `'pendingPlaces'` — JSON array of `Place[]`
- URL params kept: `days` (number), `mode` (TransportMode) — `places` param removed

- [ ] **Step 1: Write the failing tests**

Create `__tests__/itinerary-session.test.tsx`:

```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock Next.js navigation
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('days=2&mode=driving'),
}))

// Mock the server action
jest.mock('@/app/actions/plan', () => ({
  planItinerary: jest.fn().mockResolvedValue({
    days: [{ day: 1, places: [], aiSummary: null }],
    transportMode: 'driving',
  }),
}))

// Mock ItineraryClient so we only test the page shell
jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: () => <div data-testid="itinerary-client" />,
}))

import ItineraryPage from '@/app/itinerary/page'
import { planItinerary } from '@/app/actions/plan'

describe('ItineraryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
  })

  it('redirects to / when sessionStorage has no places', async () => {
    render(<ItineraryPage />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('redirects to / when places array has fewer than 2 items', async () => {
    sessionStorage.setItem('pendingPlaces', JSON.stringify([{ id: '1' }]))
    render(<ItineraryPage />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('calls planItinerary and renders ItineraryClient when places are valid', async () => {
    const places = [
      { id: '1', placeId: 'p1', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, ticketPrice: null },
      { id: '2', placeId: 'p2', name: 'B', type: 'restaurant', lat: 1, lng: 1, address: '', openingHours: null, rating: null, photoUrl: null, ticketPrice: null },
    ]
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    render(<ItineraryPage />)
    await waitFor(() => expect(screen.getByTestId('itinerary-client')).toBeInTheDocument())
    expect(planItinerary).toHaveBeenCalledWith(places, 2, 'driving')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest __tests__/itinerary-session.test.tsx --no-coverage
```

Expected: FAIL — page is a server component, sessionStorage not used.

- [ ] **Step 3: Update `app/page.tsx` submit handler**

Replace the `handleSubmit` function (keep everything else unchanged):

```typescript
const handleSubmit = () => {
  if (places.length < 2) return
  sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
  router.push(`/itinerary?days=${days}&mode=${mode}`)
}
```

Also remove the `params` construction and the old `router.push` call with `URLSearchParams`.

- [ ] **Step 4: Rewrite `app/itinerary/page.tsx` as a client component**

Replace the entire file:

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { planItinerary } from '@/app/actions/plan'
import { ItineraryClient } from './ItineraryClient'
import type { Place, TransportMode, PlanResult } from '@/lib/types'

export default function ItineraryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [plan, setPlan] = useState<PlanResult | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('pendingPlaces')
    if (!raw) { router.replace('/'); return }

    let places: Place[]
    try {
      places = JSON.parse(raw)
    } catch {
      router.replace('/')
      return
    }

    if (places.length < 2) { router.replace('/'); return }

    const days = Number(searchParams.get('days') ?? 2)
    const mode = (searchParams.get('mode') ?? 'driving') as TransportMode

    planItinerary(places, days, mode).then(setPlan)
  }, [router, searchParams])

  if (!plan) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-gray-500">載入中...</p>
      </main>
    )
  }

  return <ItineraryClient initial={plan} />
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx jest __tests__/itinerary-session.test.tsx --no-coverage
```

Expected: PASS — 3 tests passing.

- [ ] **Step 6: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx app/itinerary/page.tsx __tests__/itinerary-session.test.tsx
git commit -m "feat: pass places via sessionStorage, guard empty itinerary sessions"
```

---

## Task 4: Auto-trigger Recommendations

**Files:**
- Modify: `components/RecommendPanel.tsx` — remove idle state, add `useEffect` auto-load
- Create: `__tests__/recommend-panel.test.tsx`

**Interfaces:**
- Consumes: `getRecommendations(currentPlaces: ScheduledPlace[]): Promise<Recommendation[]>` from `app/actions/recommend`
- Props unchanged: `{ currentPlaces: ScheduledPlace[], onAddPlaces: (places: ScheduledPlace[]) => void }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/recommend-panel.test.tsx`:

```tsx
/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

jest.mock('@/app/actions/recommend', () => ({
  getRecommendations: jest.fn().mockResolvedValue([]),
}))

import { RecommendPanel } from '@/components/RecommendPanel'
import { getRecommendations } from '@/app/actions/recommend'

const noopAdd = jest.fn()

describe('RecommendPanel', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls getRecommendations automatically on mount without user interaction', async () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(1))
  })

  it('shows loading state immediately on mount', () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    expect(screen.getByText('分析中...')).toBeInTheDocument()
  })

  it('shows empty message when recommendations list is empty', async () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    await waitFor(() =>
      expect(screen.getByText(/目前沒有推薦/)).toBeInTheDocument()
    )
  })

  it('shows refresh button after initial load completes', async () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    await waitFor(() =>
      expect(screen.getByText('重新整理推薦')).toBeInTheDocument()
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest __tests__/recommend-panel.test.tsx --no-coverage
```

Expected: FAIL — component has no auto-load, shows idle "取得推薦" button instead.

- [ ] **Step 3: Update `components/RecommendPanel.tsx`**

Replace the entire file:

```tsx
'use client'
import { useState, useEffect } from 'react'
import type { Recommendation, ScheduledPlace } from '@/lib/types'
import { RecommendCard } from './RecommendCard'
import { getRecommendations } from '@/app/actions/recommend'

interface Props {
  currentPlaces: ScheduledPlace[]
  onAddPlaces: (places: ScheduledPlace[]) => void
}

export function RecommendPanel({ currentPlaces, onAddPlaces }: Props) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const result = await getRecommendations(currentPlaces)
      setRecs(result)
    } catch {
      setRecs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const handleAdd = () => {
    if (!recs) return
    const toAdd: ScheduledPlace[] = recs
      .filter((r) => selected.has(r.name) && r.verified && r.placeId && r.lat !== null && r.lng !== null)
      .map((r) => ({
        id: crypto.randomUUID(),
        placeId: r.placeId as string,
        name: r.name,
        type: r.type as 'attraction' | 'restaurant',
        lat: r.lat as number,
        lng: r.lng as number,
        address: '',
        openingHours: null,
        rating: null,
        photoUrl: null,
        ticketPrice: null,
        startTime: '09:00',
        durationMin: r.type === 'restaurant' ? 60 : 90,
        travelMinToNext: null,
        aiDescription: r.reason,
        outsideHours: false,
      }))
    onAddPlaces(toAdd)
    setSelected(new Set())
  }

  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-xl font-bold text-gray-800 mb-2">推薦地點</h2>
      <p className="text-sm text-gray-500 mb-4">根據參考網站自動分析，找出適合加入你行程的地點</p>

      {loading && (
        <p className="text-gray-400 text-sm">分析中...</p>
      )}

      {!loading && recs !== null && (
        <button
          onClick={load}
          className="text-sm text-gray-500 underline mb-4"
        >
          重新整理推薦
        </button>
      )}

      {!loading && recs !== null && recs.length === 0 && (
        <p className="text-gray-400 text-sm">目前沒有推薦（請先在後台設定參考網站）</p>
      )}

      {!loading && recs !== null && recs.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {recs.map((r, i) => (
              <RecommendCard
                key={`${r.sourceLabel}-${i}`}
                rec={r}
                selected={selected.has(r.name)}
                onToggle={() => toggle(r.name)}
              />
            ))}
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleAdd}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              加入 {selected.size} 個地點並重新排序
            </button>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest __tests__/recommend-panel.test.tsx --no-coverage
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/RecommendPanel.tsx __tests__/recommend-panel.test.tsx
git commit -m "feat: auto-trigger recommendations on itinerary page load"
```
