status: DONE
commits:
  - 99f786b5fd35ce10c914ee89ef20f1f31025bf83
tests:
  - `npx jest -- line-types` — PASS
files_changed:
  - `supabase/migrations/0004_line_group_candidate_ingest.sql`
  - `lib/types.ts`
  - `__tests__/line-types.test.ts`
self_review_notes:
  - Added the LINE source/binding/job schema and shared TypeScript types exactly for Task 1 scope.
  - Used a focused temp-project `tsc` check inside the Jest test so the type regression fails for the right reason without pulling in unrelated repo-wide TypeScript issues.
  - Kept the change limited to the owned files and committed with the brief’s requested message.

---
fix_review: Task 1 LINE group candidate ingest status constraints
status: DONE
commit_hash: final commit hash reported in response
commit_note: Commit hashes are self-referential when embedded in the committed report file.
tests:
  - `npx jest -- line-types` �X PASS (1 suite, 2 tests)
files_changed:
  - `supabase/migrations/0004_line_group_candidate_ingest.sql`
  - `.superpowers/sdd/task-1-report.md`
self_review_notes:
  - Added DB-level CHECK constraints for `trip_line_groups.status` and `line_ingest_jobs.status` using idempotent migration blocks.
  - Left `updated_at` behavior unchanged because adding trigger infrastructure would exceed the required low-risk fix.
  - No unrelated files were modified.
