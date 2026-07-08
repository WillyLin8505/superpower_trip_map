# Final LINE Review Fix Report

Status: complete

Commit hash:
- Pending final commit; final hash is reported in the handoff because a commit cannot contain its own final hash.

Tests run/results:
- `npx jest -- line-jobs line-webhook-route candidates-actions` ¡X passed: 3 test suites, 24 tests.
- `npx jest -- line-types line-signature line-parser line-bindings line-client line-ingest line-jobs line-webhook-route candidates-actions candidate-panel` ¡X passed: 10 test suites, 51 tests.

Files changed:
- `supabase/migrations/0004_line_group_candidate_ingest.sql`
- `lib/line/jobs.ts`
- `app/api/line/webhook/route.ts`
- `app/actions/candidates.ts`
- `__tests__/line-jobs.test.ts`
- `__tests__/line-webhook-route.test.ts`
- `__tests__/candidates-actions.test.ts`
- `.superpowers/sdd/final-line-review-fix-report.md`

Self-review notes:
- Enabled RLS on `line_ingest_jobs` without client policies so access remains service-role/admin-only.
- Added a partial unique index for `(trip_id, place->>'placeId')` where `placeId` is present.
- Made job recording idempotent for Postgres unique violations (`23505`).
- Made LINE candidate insert races return `duplicate` on Postgres unique violations (`23505`).
- Changed normal message processing failures to mark the job failed and return HTTP 200 after signature validation.
- Moved `done` marking after successful replies; reply failures now mark the job failed, return HTTP 200, and do not re-run candidate insert processing.
- Left unrelated pre-existing working tree edits in `.superpowers/sdd/progress.md`, `.superpowers/sdd/task-2-report.md`, `.superpowers/sdd/task-5-report.md`, and `.superpowers/sdd/task-7-report.md` untouched.
## Second Fix: Duplicate LINE Retry Short-Circuit

Status: pending verification and commit

Files changed:
- `lib/line/jobs.ts`
- `app/api/line/webhook/route.ts`
- `__tests__/line-jobs.test.ts`
- `__tests__/line-webhook-route.test.ts`
- `.superpowers/sdd/final-line-review-fix-report.md`

Self-review notes:
- Changed `recordLineIngestJob` to return `created` or `duplicate`.
- Preserved Postgres duplicate key handling for code `23505`, now returning `duplicate`.
- Updated LINE webhook handling to return immediately for duplicate message IDs before profile lookup, ingest processing, reply, or job marking.
- Added focused tests for job helper duplicate return and webhook duplicate skip behavior.
- Left unrelated pre-existing working tree edits in `.superpowers/sdd/progress.md`, `.superpowers/sdd/task-2-report.md`, `.superpowers/sdd/task-5-report.md`, and `.superpowers/sdd/task-7-report.md` untouched.

Verification:
- `npx jest -- line-jobs line-webhook-route` ¡X passed: 2 test suites, 11 tests.
- `npx jest -- line-types line-signature line-parser line-bindings line-client line-ingest line-jobs line-webhook-route candidates-actions candidate-panel` ¡X passed: 10 test suites, 52 tests.
