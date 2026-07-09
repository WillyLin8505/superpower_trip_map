# Itinerary Editor Day-Count Stepper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a ▲/▼ stepper next to "共 N 天" in the itinerary editor so a user can grow/shrink trip length without touching the raw date `<input>` fields — a pure UI convenience over logic that already exists and is not touched.

**Architecture:** Two inline `<button>` elements added to the existing date-controls `<section>` in `ItineraryClient.tsx`. Both call the existing `handleChangeEndDate(iso)` with a date computed from the *current effective target day count* `N` (`targetDays ?? plan.days.length` — already computed in the component at line 601), not from raw `plan.days.length`. This distinction matters: `plan.days.length` never changes on shrink (see spec §2), so if the stepper based its math on `plan.days.length` instead of `N`, repeated ▼ clicks would recompute the same date every time and get stuck after one decrement. Basing it on `N` lets ▼ actually keep decrementing the pending target, and lets ▲ correctly cancel a pending shrink before growing past the real day count. No new state, no new server action, no changes to `handleDeleteDay`, `handleScatterDay`, or the `overCount` banner.

**Tech Stack:** Next.js / React (existing `ItineraryClient.tsx` client component), Jest + React Testing Library (existing `__tests__/itinerary-date-controls.test.tsx`).

## Global Constraints

- TypeScript strict, no production `any`.
- Only modify `app/itinerary/ItineraryClient.tsx` and `__tests__/itinerary-date-controls.test.tsx`.
- Do not change `handleDeleteDay`, `handleScatterDay`, or the `overCount` banner's copy/behavior.
- UI copy in Traditional Chinese; `aria-label` values match the input-page stepper spec's naming (`增加一天` / `減少一天`).
- All existing tests stay green; `npm run build` (`next build`) succeeds.
- Spec reference: `docs/superpowers/specs/2026-07-09-itinerary-editor-day-count-stepper-design.md`.
- Do not start this task until TASK-006 and TASK-007 have released their lock on `app/itinerary/ItineraryClient.tsx` (see `planning/PARALLEL_WORK_PLAN.md` "Do Not Run Together" — TASK-014 conflicts with active `ItineraryClient.tsx` work). Confirm via `$multi-claim-task` before starting.

---

### Task 1: Add day-count stepper buttons to the itinerary editor

**Files:**
- Modify: `app/itinerary/ItineraryClient.tsx:636-651` (JSX — date-controls section)
- Test: `__tests__/itinerary-date-controls.test.tsx` (append new tests)

**Interfaces:**
- Consumes: `handleChangeEndDate(iso: string): void` (existing, `ItineraryClient.tsx:503-519`, unmodified) · `addDays(iso: string, n: number): string` and `dayDate(startDate: string, dayNumber: number): string` (existing, `lib/utils/date.ts`, already imported at `ItineraryClient.tsx:20`) · `N` (existing local const `targetDays ?? plan.days.length`, `ItineraryClient.tsx:601`).
- Produces: two buttons, `data-testid="day-count-stepper-up"` (`aria-label="增加一天"`) and `data-testid="day-count-stepper-down"` (`aria-label="減少一天"`, `disabled` when `N <= 1`). No new exported functions or types — purely internal JSX, nothing for other tasks to consume.

- [ ] **Step 1: Write the failing tests**

Open `__tests__/itinerary-date-controls.test.tsx`. Add a second plan-building helper (the existing `plan()` only returns 1 day) and four new `it` blocks, appended after the existing three tests (after line 105):

```tsx
function planWithDays(n: number): PlanResult {
  return {
    startDate: '2026-06-28', transportMode: 'driving',
    days: Array.from({ length: n }, (_, i) => ({
      day: i + 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [],
    })),
  }
}

it('clicking ▲ appends an empty day', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-up'))
  await waitFor(() => expect(screen.getByText(/共 2 天/)).toBeInTheDocument())
  expect(screen.getByText('第 2 天 · 6/29（一）')).toBeInTheDocument()
})

it('clicking ▼ sets a pending target and shows the overCount banner without deleting days', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（2），請處理超出的天。')).toBeInTheDocument()
  )
  expect(screen.getByText(/共 3 天/)).toBeInTheDocument() // unchanged — no auto-delete
})

it('clicking ▼ repeatedly keeps decrementing the pending target (not stuck after one click)', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（2），請處理超出的天。')).toBeInTheDocument()
  )
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（1），請處理超出的天。')).toBeInTheDocument()
  )
  expect(screen.getByTestId('day-count-stepper-down')).toBeDisabled() // floor reached
})

it('clicking ▲ after a pending shrink cancels it instead of growing past the real day count', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（2），請處理超出的天。')).toBeInTheDocument()
  )
  fireEvent.click(screen.getByTestId('day-count-stepper-up'))
  await waitFor(() =>
    expect(screen.queryByText(/行程天數（3）大於設定天數/)).not.toBeInTheDocument()
  )
  expect(screen.getByText(/共 3 天/)).toBeInTheDocument() // still 3 — target reset to match, no day appended
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest itinerary-date-controls -t "day-count-stepper" --verbose`
(or `npx jest itinerary-date-controls -t "▲|▼"` if the `-t` regex needs escaping for your shell)
Expected: all 4 new tests FAIL with `Unable to find an element by: [data-testid="day-count-stepper-up"]` (or `-down`) — the buttons don't exist yet.

- [ ] **Step 3: Implement the stepper buttons**

In `app/itinerary/ItineraryClient.tsx`, find this block (currently lines 636-651):

```tsx
      <section className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">開始日期</span>
          <input type="date" data-testid="trip-start-date" value={plan.startDate}
            onChange={(e) => handleChangeStartDate(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">結束日期</span>
          <input type="date" data-testid="trip-end-date" min={plan.startDate}
            value={dayDate(plan.startDate, plan.days.length)}
            onChange={(e) => handleChangeEndDate(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <span className="text-sm text-muted pb-1.5">共 {plan.days.length} 天</span>
      </section>
```

Replace the final `<span>` line with:

```tsx
        <div className="flex items-center gap-1 pb-1.5">
          <span className="text-sm text-muted">共 {plan.days.length} 天</span>
          <div className="flex flex-col" data-testid="day-count-stepper">
            <button
              type="button"
              aria-label="增加一天"
              data-testid="day-count-stepper-up"
              onClick={() => handleChangeEndDate(addDays(dayDate(plan.startDate, N), 1))}
              className="text-xs px-2 py-1 rounded-full border border-border hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="減少一天"
              data-testid="day-count-stepper-down"
              disabled={N <= 1}
              onClick={() => handleChangeEndDate(addDays(dayDate(plan.startDate, N), -1))}
              className="text-xs px-2 py-1 rounded-full border border-border hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ▼
            </button>
          </div>
        </div>
```

This block sits after `N` is computed (`const N = targetDays ?? plan.days.length`, line 601) and before the `return` statement's JSX at line ~610 — `N` is already in scope by the time this JSX renders, so no new variable is needed.

Add `addDays` to the existing import from `lib/utils/date` (currently `import { daysBetween, dayDate } from '@/lib/utils/date'` at line 20):

```tsx
import { addDays, daysBetween, dayDate } from '@/lib/utils/date'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest itinerary-date-controls --verbose`
Expected: all 7 tests in the file PASS (3 existing + 4 new).

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm test`
Expected: PASS — no change in total suite/test counts other than the 4 new tests; no existing test touching `ItineraryClient.tsx` breaks.

- [ ] **Step 6: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this change (pre-existing unrelated repo errors, if any, are not this task's concern — confirm none of them reference `ItineraryClient.tsx` lines you touched).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/itinerary/ItineraryClient.tsx __tests__/itinerary-date-controls.test.tsx
git commit -m "feat(itinerary): add day-count stepper to itinerary editor (TASK-014)

Compact ▲/▼ next to 共 N 天, reusing the existing handleChangeEndDate/
overCount banner flow untouched. Steps from the current target N
(targetDays ?? plan.days.length), not raw plan.days.length, so repeated
▼ clicks keep decrementing instead of getting stuck after one click.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Y68QYm5SPLdSYDDvCVsHq2"
```

---

## Self-Review

**Spec coverage:**
- §3 scope (only `ItineraryClient.tsx`, no new state/action, existing delete/scatter/banner untouched) — Task 1, Steps 3 & 4. ✅
- §4 state model (reuse `handleChangeEndDate`) — Task 1, Step 3, buttons call it directly. ✅ (refined: uses `N`, not raw `plan.days.length`, as the basis for the date math — see Architecture note. This is a necessary correction caught while writing concrete code; the spec's §4 pseudocode used `plan.days.length` for `currentEnd`, which would make repeated ▼ clicks idempotent after the first click since `plan.days.length` never changes on shrink. `N` is the correct basis and is already computed in the component.)
- §5 floor (▼ disabled at 1 day) — Task 1, Step 3, `disabled={N <= 1}`; Step 1 test "floor reached" assertion. ✅
- §6 UI/layout (▲ over ▼, right of the label, aria-labels) — Task 1, Step 3 JSX. ✅
- §8 test cases 1 (grow), 3 (shrink shows banner, no delete), 4 (floor) — Task 1, Step 1. Test case 2 ("no-content last day") and 5 ("no regression to raw date input") are satisfied by construction: the stepper never deletes a day regardless of content (test covers the general shrink-shows-banner case, which subsumes the empty-day case), and the existing raw end-date-input tests are untouched and still run in Step 5.
- §9 global constraints — carried into this plan's Global Constraints section verbatim.

**Placeholder scan:** No TBD/TODO; every step has complete, runnable code.

**Type consistency:** `handleChangeEndDate(iso: string): void`, `addDays(iso: string, n: number): string`, `dayDate(startDate: string, dayNumber: number): string`, `N: number` — all match their existing definitions in `ItineraryClient.tsx` / `lib/utils/date.ts` cited above; no new types introduced.
