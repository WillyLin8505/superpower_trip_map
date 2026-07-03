# Task 5 Report: MembersPanel

## Summary
- Added `components/MembersPanel.tsx` as a client-side panel for trip members.
- Added `__tests__/members-panel.test.tsx` covering owner invite flow, owner remove flow, and non-owner leave flow.
- Kept UI copy exactly as required: `成員`, `產生邀請連結`, `複製連結`, `重新產生連結`, `移除`, `離開行程`.

## TDD Notes
- Wrote `__tests__/members-panel.test.tsx` first.
- Verified red with `npx jest -- members-panel`, which failed because the component module was missing.
- Implemented the minimal component to satisfy the tests.
- Verified green with `npx jest -- members-panel`.

## Test Results
- `npx jest -- members-panel` ✅
- `npx jest` ✅ (`67` suites passed, `305` tests passed)

## Concerns
- `npx jest -- members-panel` works in this repo once the filename exists, but earlier on Windows it surfaced module-missing behavior rather than a clean path-filter failure; the targeted suite still provided the required red/green signal.
