# Task 6 Report: Webhook Route And Job Storage

## Status
Complete.

## Commit Hash(es)
- 4b5b8b56cefeeba11c3237db8d152dc7f20fc245 - feat(laneC-line): add line webhook route

## Tests Run With Results
- RED: `npx jest -- line-jobs line-webhook-route` - FAIL as expected before implementation because `@/lib/line/jobs` and webhook route were missing.
- GREEN: `npx jest -- line-jobs line-webhook-route` - PASS, 2 test suites passed, 6 tests passed.
- Focused suite: `npx jest -- line-types line-signature line-parser line-bindings line-client line-ingest line-jobs line-webhook-route candidates-actions candidate-panel` - PASS, 10 test suites passed, 46 tests passed.

## Files Changed
- `lib/line/jobs.ts`
- `app/api/line/webhook/route.ts`
- `__tests__/line-jobs.test.ts`
- `__tests__/line-webhook-route.test.ts`

## Self-Review Notes
- Followed TDD: added job and route tests first, verified the expected missing-module failure, then implemented minimal production code.
- Job storage writes queued records to `line_ingest_jobs` and marks terminal statuses with `processed_at` plus nullable errors.
- Webhook route verifies LINE signatures before processing, handles bind/unbind/malformed commands, records ingest jobs for group text messages, marks done/ignored/failed, and replies only when processing returns a reply.
- Added `jest.clearAllMocks()` in the route test setup to prevent mock call leakage between cases while preserving the brief's assertions and values.
- Did not modify or revert pre-existing unrelated working tree edits in `.superpowers/sdd/progress.md`, `.superpowers/sdd/task-2-report.md`, or `.superpowers/sdd/task-5-report.md`.

## Working Tree After Commit
```text
 M .superpowers/sdd/progress.md
 M .superpowers/sdd/task-2-report.md
 M .superpowers/sdd/task-5-report.md
```

---

## Review-Fix Report (2026-07-08)

### Status
Complete.

### Commit Hash(es)
- Pending final commit; final hash reported in handoff because a commit cannot contain its own final hash.

### Tests Run With Results
- RED: `npx jest -- line-webhook-route` - FAIL as expected before implementation; `getLineProfile` rejection aborted the webhook before the new message could be recorded or marked.
- GREEN focused suite: `npx jest -- line-webhook-route` - PASS, 1 test suite passed, 5 tests passed.
- Covering suite: `npx jest -- line-jobs line-webhook-route` - PASS, 2 test suites passed, 7 tests passed.

### Files Changed
- `app/api/line/webhook/route.ts`
- `__tests__/line-webhook-route.test.ts`
- `.superpowers/sdd/task-6-report.md`

### Self-Review Notes
- `recordLineIngestJob` now runs before profile lookup for normal text messages, preserving the ingest audit trail even when LINE profile lookup is transiently unavailable.
- Profile lookup failure is isolated from message processing; the message continues with `lineDisplayName: undefined`.
- Added a regression test that rejects `getLineProfile` and verifies the job is recorded, processed, and marked `ignored`.
- Did not modify or revert pre-existing unrelated working tree edits in `.superpowers/sdd/progress.md`, `.superpowers/sdd/task-2-report.md`, or `.superpowers/sdd/task-5-report.md`.
