# Task 4 Report: Candidate Source Writer And UI Display

Status: complete

Commit hashes:
- b6e63a4 feat(laneC-line): write and show line candidate sources

Tests run:
- RED: `npx jest -- candidates-actions candidate-panel` — failed as expected before implementation:
  - `listCandidates maps source metadata when present` failed because `source` was not mapped.
  - `addCandidateFromLine inserts with source and writeAsUserId` failed because `addCandidateFromLine` did not exist.
  - `shows LINE source text when candidate came from LINE` failed because the UI still rendered the normal adder label.
- GREEN: `npx jest -- candidates-actions candidate-panel` — passed:
  - Test Suites: 2 passed, 2 total
  - Tests: 18 passed, 18 total
  - Snapshots: 0 total

Files changed:
- `app/actions/candidates.ts`
- `components/CandidatePanel.tsx`
- `__tests__/candidates-actions.test.ts`
- `__tests__/candidate-panel.test.tsx`

Self-review notes:
- Followed TDD: added source-aware action and UI tests first, verified the expected failures, then implemented minimal changes.
- `listCandidates` now selects and maps `source` while preserving existing candidate name resolution behavior.
- Added `addCandidateFromLine` using the admin client, duplicate detection by `trip_id` and `place->>placeId`, and the specified `LINE_CANDIDATE_INSERT_FAILED` error.
- `CandidatePanel` now derives the small source label from candidate metadata, showing LINE group/source text when present and the existing adder text otherwise.
- Did not stage or modify unrelated pre-existing working tree edits in `.superpowers/sdd/progress.md` or `.superpowers/sdd/task-2-report.md`.

## Task 4 Review Fix: Duplicate Lookup Error Handling

Status: complete

Commit hash:
- See atomic fix commit containing this report.

Tests run:
- `npx jest -- candidates-actions candidate-panel` — passed:
  - Test Suites: 2 passed, 2 total
  - Tests: 19 passed, 19 total
  - Snapshots: 0 total

Files changed:
- `app/actions/candidates.ts`
- `__tests__/candidates-actions.test.ts`
- `.superpowers/sdd/task-4-report.md`

Self-review notes:
- `addCandidateFromLine` now captures duplicate lookup errors from `.maybeSingle()` and throws `LINE_CANDIDATE_LOOKUP_FAILED` before insert.
- Added a regression test that forces lookup failure and asserts no insert payload is recorded.
- Left unrelated pre-existing working tree edits outside the owned files untouched.
