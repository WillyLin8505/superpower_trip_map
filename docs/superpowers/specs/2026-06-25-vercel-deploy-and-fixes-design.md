# Design: Vercel Deploy + Bug Fixes

**Date:** 2026-06-25  
**Status:** Approved

## Goal

Make the app deployable to Vercel and fix 5 known issues: one deploy blocker (Claude CLI), one security issue (API key leak), one data integrity issue (URL length), one missing guard (empty places), and one UX improvement (auto-trigger recommendations).

---

## Issue 1 — Claude CLI Spawn (Deploy Blocker)

**File:** `lib/claude.ts`  
**Problem:** Uses `spawn('claude', '-p', prompt)` to call the Claude CLI. Vercel serverless functions cannot spawn arbitrary binaries — the Claude CLI doesn't exist in the runtime environment. Recommendations crash on deploy.

**Fix:** Replace with `@anthropic-ai/sdk`. Direct API call, no subprocess.

**Design:**
- Install `@anthropic-ai/sdk`
- Rewrite `lib/claude.ts` to use `Anthropic` client with `messages.create()`
- Model: `claude-haiku-4-5-20251001` — fast and cheap for JSON extraction
- Keep the same function signature: `callClaude(prompt: string): Promise<string>` — no other files change
- `ANTHROPIC_API_KEY` env var (already needed, now consumed by SDK instead of CLI)

---

## Issue 2 — Photo URL Exposes API Key to Browser

**File:** `app/actions/places.ts:30`  
**Problem:** `photoUrl` is built as `https://maps.googleapis.com/maps/api/place/photo?...&key=SERVER_KEY`. This URL is returned to the client and the browser fetches it directly, exposing the server-side API key in the network tab.

**Fix:** Add a server-side proxy route. Client receives `/api/photo?ref=<photo_reference>` instead.

**Design:**
- Add `app/api/photo/route.ts` — GET handler reads `ref` query param, fetches from Google with the server key, streams the response back
- Update `places.ts:30` to build `/api/photo?ref=${r.photos[0].photo_reference}` instead of the direct Google URL
- The API key never leaves the server

---

## Issue 3 — URL Length Overflow with 25 Places

**File:** `app/page.tsx:29`, `app/itinerary/page.tsx:11`  
**Problem:** Places are JSON-serialized into `?places=...` URL param. 25 full Place objects ≈ 15,000+ chars — exceeds browser URL limits (~2000 chars), causing silent truncation and broken itinerary pages.

**Fix:** Use `sessionStorage` to pass places between pages.

**Design:**
- `app/page.tsx`: On submit, write `sessionStorage.setItem('pendingPlaces', JSON.stringify(places))` then navigate to `/itinerary?days=N&mode=M` (no places in URL)
- `app/itinerary/page.tsx`: Convert to client component; read places from `sessionStorage` on mount, then call `planItinerary`
- Keep `days` and `mode` in URL (small, shareable)
- If `sessionStorage` is empty on itinerary page, redirect to `/`

---

## Issue 4 — No Guard for Empty Places

**File:** `app/itinerary/page.tsx`  
**Problem:** Direct navigation to `/itinerary` with no places calls `planItinerary([])`, which may throw or return an empty plan with no error shown to the user.

**Fix:** Guard at the top of the itinerary page: if places array is empty after reading from sessionStorage, redirect to `/`.

**Note:** This is handled as part of Issue 3's client component rewrite — the sessionStorage empty check and redirect live together.

---

## Issue 5 — Recommendations Require Manual Trigger

**File:** `components/RecommendPanel.tsx`  
**Problem:** User must click "取得推薦" to fetch recommendations. The original design called for auto-parallel fetch when the itinerary page loads.

**Fix:** Call `getRecommendations` automatically in `useEffect` on mount.

**Design:**
- Remove the initial "取得推薦" button
- `useEffect(() => { load() }, [])` triggers fetch on mount
- Keep the "重新整理推薦" refresh button for subsequent re-fetches
- Show a loading spinner immediately instead of an idle state

---

## Architecture

```
lib/claude.ts          ← rewritten: Anthropic SDK instead of CLI spawn
app/api/photo/route.ts ← new: photo proxy endpoint
app/page.tsx           ← updated: sessionStorage write on submit
app/itinerary/page.tsx ← updated: client component, reads sessionStorage
components/RecommendPanel.tsx ← updated: auto-fetch on mount
```

No database changes. No new dependencies beyond `@anthropic-ai/sdk`.

---

## Environment Variables

| Variable | Used by | Value |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | `lib/claude.ts` (SDK) | New key from console.anthropic.com |
| `GOOGLE_MAPS_API_KEY` | Server actions (Places, Distance Matrix, Directions, Photo proxy) | Google Cloud key |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `app/layout.tsx` (Maps JS API script tag) | Same Google Cloud key |

---

## Testing

Each fix has a clear test boundary:

| Fix | Test |
|-----|------|
| Claude SDK | Unit test `callClaude()` with mocked Anthropic client; assert correct model + prompt format |
| Photo proxy | Unit test `/api/photo` route; assert it fetches from Google and returns the image |
| sessionStorage | Integration test: submit form → check sessionStorage written → itinerary page reads it |
| Empty guard | Test: navigate to `/itinerary` with empty sessionStorage → assert redirect to `/` |
| Auto-trigger | Test: mount `RecommendPanel` → assert `getRecommendations` called without user interaction |

---

## Task Breakdown (for implementation plan)

1. **Claude SDK migration** — install `@anthropic-ai/sdk`, rewrite `lib/claude.ts`, update tests
2. **Photo proxy route** — add `app/api/photo/route.ts`, update `places.ts` photoUrl builder
3. **sessionStorage places handoff** — update `app/page.tsx` submit handler, rewrite `app/itinerary/page.tsx` as client component
4. **Empty places guard** — covered in Task 3 (sessionStorage empty → redirect)
5. **Auto-trigger recommendations** — update `RecommendPanel.tsx` useEffect
