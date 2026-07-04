# Task 3 Report

## Status
- Completed C2 Task 3 member listing and removal actions.

## Changes
- Appended `listMembers`, `removeMember`, and `leaveTrip` to `app/actions/members.ts`.
- Added `__tests__/members-list-actions.test.ts` covering RLS-hidden trips, member name resolution, removal, self-leave, and unauthenticated leave.
- Preserved existing invite action behavior and tests.

## TDD Notes
- Wrote `__tests__/members-list-actions.test.ts` first.
- Verified red with `npx jest __tests__/members-list-actions.test.ts` showing missing exports.
- Implemented the minimal action code.
- Verified green on targeted suites and full Jest.

## Test Results
- `npx jest __tests__/members-list-actions.test.ts` ?
- `npx jest -- members-list-actions members-invite-actions` ?
- `npx jest __tests__/members-list-actions.test.ts __tests__/members-invite-actions.test.ts` ?
- `npx jest` ?

## Concerns
- None.
