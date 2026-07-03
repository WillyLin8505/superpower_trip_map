# Task 7 Report: Roadmap Update + Full Gate

**Branch:** `lane/c2-sharing`
**Date:** 2026-07-03

---

## Step 1: Roadmap Update

**File changed:** `docs/superpowers/specs/2026-07-01-laneC-roadmap.md` (line 17)

Changed C2 row from:
```
| C2 | 分享 + 成員（邀請連結 → 別人能加入同一趟 trip）| pending | C1 |
```
To:
```
| **C2** | 分享 + 成員（邀請連結 → 別人能加入同一趟 trip）| **DONE** (branch: `lane/c2-sharing`; live Supabase/OAuth verification pending keys) | C1 |
```

---

## Step 2: Full Gate Results

### Jest
```
Test Suites: 68 passed, 68 total
Tests:       310 passed, 310 total
Snapshots:   0 total
Time:        3.399 s
Ran all test suites.
```
**Result: PASS (310/310)**

### ESLint
```
✔ No ESLint warnings or errors
```
**Result: PASS**

### Next.js Build (`npm run build`)
```
✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (13/13)
   Finalizing page optimization ...

Route (app)                              Size     First Load JS
├ ƒ /join/[token]                        175 B          96.2 kB
...
ƒ  (Dynamic)  server-rendered on demand
```
**Result: PASS** (TypeScript types clean; `/join/[token]` route compiled successfully)

Note: The expected `@supabase/ssr` → `process.version` Edge Runtime warning appeared in the build trace (non-blocking, investigated in C1).

---

## Step 3: Commit

```
[lane/c2-sharing 75d135e] docs(laneC-c2): record C2 code-complete status
 1 file changed, 1 insertion(+), 1 deletion(-) 
```

---

## Files Changed

- `docs/superpowers/specs/2026-07-01-laneC-roadmap.md` — C2 status updated to DONE

## Fixes Made

None required. All gates passed clean on first run.

## Concerns

None. All 310 tests pass, lint is clean, and the full production build succeeds including the new C2 routes (`/join/[token]`, `/itinerary/[tripId]` with MembersPanel). Live Supabase/OAuth verification deferred until keys are available.

---

## Whole-Branch Review Fixes (commit 6cbb548)

Applied all four findings from the whole-branch code review.

### I1 — `supabase/migrations/0002_sharing.sql`: security-definer search_path
Added `set search_path = public` between `stable` and `as $$` on `public.is_trip_participant`.
File: `supabase/migrations/0002_sharing.sql` (line 25 inserted).
No unit test (SQL-only change).

### I2 — `app/actions/members.ts`: `removeMember` auth guard
Added `await requireUserId()` as the first line of `removeMember` body (line 166).
File: `app/actions/members.ts`.
Test added: `__tests__/members-list-actions.test.ts` — "removeMember throws NOT_AUTHENTICATED when logged out".

### I3 — `supabase/migrations/0002_sharing.sql`: constrain `role`
Changed `role text not null default 'editor'` to `role text not null default 'editor' check (role = 'editor')` in `trip_members` DDL.
File: `supabase/migrations/0002_sharing.sql` (line 12).
No unit test (SQL-only change).

### M1 — `app/join/[token]/page.tsx`: normalize zh-TW copy
Replaced `{'邀請...'}` unicode escapes with literal CJK characters `邀請連結無效或已失效` and `回到我的行程` directly as JSX text content.
File: `app/join/[token]/page.tsx` (lines 29–32).
Existing join-page test `screen.getByText('邀請連結無效或已失效')` still passes (runtime text identical).

### Covering Tests

Targeted: `npx jest -- members-list-actions join-page`
Result: **9 passed, 2 suites** (8 pre-existing + 1 new removeMember NOT_AUTHENTICATED test)

Full suite: `npx jest`
Result: **311 passed, 68 suites** (was 310; +1 new test)

Build: `npm run build`
Result: **PASS** — compiled successfully, all routes including `/join/[token]`

### Commit

`6cbb548 fix(laneC-c2): harden security-definer search_path, role check, removeMember auth guard, join copy literals`
