# Task 4 Report: 認證流程

**Status:** DONE

## Files Created
- `__tests__/login-page.test.tsx` — TDD test for login page (2 cases)
- `app/login/page.tsx` — Google + LINE OAuth login page (client component)
- `app/auth/callback/route.ts` — Exchanges OAuth `code` for session, redirects to `next`
- `app/auth/signout/route.ts` — Signs out, redirects home with 303
- `middleware.ts` — Refreshes Supabase session cookie on every request

## TDD RED/GREEN
- **RED**: Ran `npx jest -- login-page` before creating `app/login/page.tsx`. Both tests failed with `Could not locate module @/app/login/page` — as expected per Step 2.
- **GREEN**: After creating `app/login/page.tsx`, both tests passed immediately (2/2, 0.935 s).

## Full Suite Results
59 suites, 263 tests — all PASS (4.964 s). No regressions.

## Step 8 — Live OAuth Verify: SKIPPED (per code-first scope)
Step 8 (`npm run dev` + real Google/LINE OAuth round-trip) was explicitly skipped. This requires live Supabase credentials and dashboard OAuth config that is not yet set up. The skip was authorised by the task instructions ("SKIP Step 8").

## Self-Review

### Correctness
- Login page reads `?next=` via `useSearchParams`, falls back to `/trips`. The `redirectTo` includes `next` in the callback URL, so the flow carries through.
- `LINE_PROVIDER = 'line' as const` kept verbatim from brief — slug must match Supabase Dashboard custom OIDC config (future Task 0 / dashboard setup).
- Callback route: if `code` missing or `exchangeCodeForSession` errors, falls back to `/login?error=auth`.
- Signout uses `POST` + 303 to avoid caching issues.
- Middleware uses `createServerClient` directly (not the wrapper in `lib/supabase/server.ts`) so it can manage cookies on the `NextRequest`/`NextResponse` objects — correct SSR pattern for Next.js 14 App Router.

### Concerns
1. **`lib/supabase/server.ts` uses `cookies()` synchronously** — Next.js 15 will require `await cookies()`. Currently on Next 14 so this is fine; worth noting for future upgrades.
2. **LINE OIDC slug** — `'line'` must exactly match the Supabase Dashboard custom provider slug. If the Dashboard uses a different identifier, sign-in will silently fail or throw. This is a deferred config dependency.
3. **No `/login?error=auth` UI** — The callback redirects there on failure but the login page does not yet render the error param. Low priority for now.
4. **`window.location.origin` in `signIn()`** — Safe in a client component, but unit test runs in jsdom where `window.location.origin` is `'http://localhost'`. The mock does not assert on `redirectTo`, so this doesn't affect test coverage.

## Commit
`52e1ca5` — feat(laneC): google+line login page, oauth callback, signout, session middleware

---

## Review Fix Report (2026-07-01)

### Changes Applied

**`app/auth/callback/route.ts` (line 7-11)**
- Renamed `next` → `rawNext`, added `safeNext` guard: `/^\/(?!\/)/.test(rawNext) ? rawNext : '/trips'`
- Success redirect now uses `safeNext` instead of raw param
- Values like `//evil.com` and `@evil.com` are rejected and default to `/trips`

**`app/login/page.tsx` (line 10-11)**
- Renamed `next` → `rawNext`, derived `next` via same `/^\/(?!\/)/.test(rawNext)` guard
- Defense-in-depth: malicious `?next=` is sanitized before being encoded into the `redirectTo` URL

**`__tests__/login-page.test.tsx`**
- Extended Google test (was: asserting `provider: 'google'`) to also assert `options: { redirectTo: stringContaining('/auth/callback?next=') }`
- Added LINE provider test: clicking `使用 LINE 登入` calls `signInWithOAuth` with `provider: 'line'`
- Added open-redirect guard test: rendering with `?next=//evil.com` makes the Google button's `redirectTo` carry `next=%2Ftrips` (malicious next rejected, defaults to `/trips`)

### Test Evidence

```
$ npx jest -- login-page
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Time:        0.897 s
```

### Full Suite

```
$ npx jest
Test Suites: 59 passed, 59 total
Tests:       265 passed, 265 total
Time:        4.598 s
```

No regressions. 265 tests (up from 263 — 2 new tests added).

### Commit
`8e2ec4e` — fix(laneC): validate next param against open-redirect + strengthen login tests
