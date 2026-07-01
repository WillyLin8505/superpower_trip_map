# Task 6 Report: ItineraryClient 儲存按鈕 + autosave + 存檔狀態

## Status
DONE

## Implementation Summary

### Files Changed
1. `app/itinerary/ItineraryClient.tsx` — core implementation
2. `__tests__/itinerary-client-save.test.tsx` — new test file (6 tests)
3. `__tests__/itinerary-client-smart-arrange.test.tsx` — added `next/navigation` + `@/app/actions/trips` mocks
4. `__tests__/itinerary-client-leg.test.tsx` — added `next/navigation` + `@/app/actions/trips` mocks

### ItineraryClient.tsx Changes
- Added `import { useRouter } from 'next/navigation'`
- Added `import { createTrip, saveTrip } from '@/app/actions/trips'`
- Extended `Props` interface with `tripId?: string`
- Added `router = useRouter()` at top of component
- Added `saveState` state: `'idle' | 'saving' | 'saved' | 'error'`
- Added `autosaveRef` for the debounce timer handle
- Added `onSave` callback (anonymous mode): calls `createTrip` → redirects to `/itinerary/<id>`; on `NOT_AUTHENTICATED` → redirects to `/login?next=%2Fitinerary`; other error → `setSaveState('error')`
- Added autosave `useEffect` (persistent mode): fires when `plan !== savedPlanRef.current`, sets `'saving'`, debounces 1500ms, calls `saveTrip`, updates `savedPlanRef.current` + `setSaveState('saved')` on success, `'error'` on failure
- Added save UI in JSX: `儲存行程` button (anonymous) or status indicator span (persistent) in a flex header row alongside the back link

### Mock Cascade Fix
`useRouter` is now called unconditionally at the top of the component. The two existing ItineraryClient test files (`itinerary-client-smart-arrange`, `itinerary-client-leg`) did not mock `next/navigation`, causing them to throw on `useRouter()`. Added the mock to both. The other 5 ItineraryClient test files already had `next/navigation` mocked. Also added `@/app/actions/trips` mock to both fixed files (component now imports it at module level).

## TDD RED/GREEN

### RED Phase
Running `npx jest -- itinerary-client-save` before implementation: 5 of 6 tests FAIL (one spuriously passed because it only checked `createTrip` was called, not a button press). Failures confirmed: "Unable to find an accessible element with role 'button' and name '儲存行程'" and missing `'儲存中…'` text.

### GREEN Phase
After implementation: all 6 save tests PASS. Full suite 273/273.

## How the Autosave Test Triggers a Real Plan Change

The persistent-mode autosave test (`shows 儲存中… immediately after a plan change`) and the succeeds test both:
1. Render `<ItineraryClient initial={plan()} tripId="t1" />`
2. Call `fireEvent.click(screen.getAllByRole('button', { name: '鎖定開始時間' })[0])`
   — This fires `handleToggleStartLock(0, 'A')` → `toggleLockField` → creates a new `PlanResult` object and calls both `planRef.current = newPlan` and `setPlan(newPlan)`
3. Because `newPlan !== savedPlanRef.current` (different object reference), the autosave `useEffect` fires immediately, setting `setSaveState('saving')` and scheduling a 1500ms timeout
4. `jest.advanceTimersByTime(2000)` fires the timeout → `saveTrip` is called → `setSaveState('saved')`

The `'does not trigger when plan has not changed'` test verifies no `saveTrip` call without any UI interaction.

## Zero-Regression Confirmation

Full suite: **273 passed, 0 failed** (61 test suites). All existing ItineraryClient tests (smart-arrange × 3, leg × 2, change-type, date-controls, lock-invariant, session, shorten-resolution, start-date-recompute) pass without modification to their test logic — only minimal mock additions were required.

## Self-Review

- `onSave` is stable (depends only on `router` which is stable); no stale-closure risk.
- Autosave effect deps `[plan, tripId]` are correct: fires whenever plan state changes or tripId changes.
- `savedPlanRef` dual usage (drag-cancel restore + autosave baseline): after drag cancel, `savedPlanRef.current` is set back to the plan-before-drag, which equals `planRef.current` after the restore, so autosave correctly sees no dirty delta. No conflict.
- Retry sets `savedPlanRef.current = {} as PlanResult` — this is the brief's specified approach. Edge case: if drag cancel fires after retry, the plan would be "restored" to `{}`. Low risk in practice (brief-specified pattern), noted as a known limitation.
- No existing scheduling logic (debounceRef / scheduleRecalc / recalcPlan timing) was altered. autosaveRef is a completely independent timer. No interference.

## Concerns
None blocking. The retry-then-drag-cancel edge case is a pre-existing design choice from the brief spec, not introduced by this implementation.

---

## Review-Fix Report (2026-07-01)

### Status
DONE

### Critical Fix — retry button never re-triggered autosave

**Root cause:** The previous handler `onClick={() => { setSaveState('saving'); savedPlanRef.current = {} as PlanResult }}` mutated a ref and called a state setter that does not appear in the autosave `useEffect` deps `[plan, tripId]`. The effect never re-ran, leaving the UI stuck on 儲存中….

**Fix applied (`app/itinerary/ItineraryClient.tsx`):**
- Added `onRetry` `useCallback` (after the autosave `useEffect`, before `scheduleRecalc`) that directly calls `saveTrip`, updates `savedPlanRef.current`, and drives `saveState` through `saving → saved | error`.
- Changed the retry `<button>` from the broken inline `onClick` to `onClick={onRetry}`.
- Removed the `savedPlanRef.current = {} as PlanResult` sentinel (also removes the `as PlanResult` unsafe cast and the drag-cancel/retry edge case noted in the original Self-Review).

### Important Fix — fake-timer teardown left pending timer

**File:** `__tests__/itinerary-client-save.test.tsx`

**Test:** "persistent mode: shows 儲存中… immediately after a plan change"

**Fix:** Added `await act(async () => { jest.advanceTimersByTime(2000) })` before `jest.useRealTimers()` to flush the 1500ms autosave debounce timer before exiting fake-timer mode, preventing the async callback from firing outside `act()` during teardown.

### New Test Added

**Test:** "persistent mode: retry button calls saveTrip and shows 已儲存 on success"

**Location:** `__tests__/itinerary-client-save.test.tsx` (7th test, end of file)

**Coverage:** Mocks `saveTrip` to reject once then resolve; renders persistent mode (`tripId="t1"`); dirties plan + advances timers → confirms `儲存失敗，點此重試` appears; clicks retry; asserts `saveTrip` is called again and `已儲存` appears.

### Exact Changes

| File | Lines changed | What |
|---|---|---|
| `app/itinerary/ItineraryClient.tsx` | ~109–120 (added `onRetry`), ~455 (button onClick) | Add `onRetry` callback; wire retry button; remove broken sentinel + unsafe cast |
| `__tests__/itinerary-client-save.test.tsx` | ~180 (teardown fix), ~198–228 (new test) | Flush fake timer before `useRealTimers()`; add retry covering test |

### Covering Test Command + Output

```
npx jest -- itinerary-client-save
Tests: 7 passed, 7 total  (1.329 s)
```

### Full Suite

```
npx jest
Test Suites: 61 passed, 61 total
Tests:       274 passed, 274 total
```

No ItineraryClient regression — all ItineraryClient test files (smart-arrange, leg, change-type, date-controls, lock-invariant, session, shorten-resolution, start-date-recompute, save) pass.
