# Session Assignment

Last updated: 2026-07-07
This project uses a task pool. Sessions do not have fixed Backend/Frontend/Testing roles.

## Assignment Rule

Any Worker Session may take any task if all are true:

1. The task status is `todo` in `planning/TASKS.md`.
2. All dependencies are `done` or explicitly waived by the Manager.
3. Conflict risk is `low` or `medium`, unless the Manager explicitly assigns a high-risk task.
4. No current `in_progress` task lists overlapping `Files likely to change`.
5. The task's `Safe to assign to any session` field is `yes`, or Manager explicitly assigns it.

## Available Task Pool

### Safe Parallel Tasks

Available after TASK-001 is done:

- TASK-002 — Formalize Spec 1 as Superpowers-ready design doc
- TASK-003 — Formalize Spec 2 as Superpowers-ready design doc
- TASK-004 — Formalize Spec 3 as Superpowers-ready design doc
- TASK-016 — Review and refresh README for project-specific onboarding

### Conditional Parallel Tasks

- TASK-013 — Admin source management can run in parallel with itinerary work after its spec is written and if no other session touches `app/actions/sources.ts`, `components/admin/*`, or `app/admin/page.tsx`.

### Do Not Run Together

- TASK-006 with TASK-007, TASK-011, or TASK-012.
- TASK-008 with TASK-009, TASK-010, or TASK-011.
- TASK-009 with TASK-010.
- TASK-010 with TASK-014 or TASK-015.
- TASK-014 with TASK-015 unless assigned to the same session.
- Any two tasks that both modify `app/itinerary/ItineraryClient.tsx`.
- Any two tasks that both modify `lib/types.ts`.

### High Risk Tasks

These should be assigned explicitly by Manager and usually done alone:

- TASK-006
- TASK-007
- TASK-008
- TASK-009
- TASK-010
- TASK-011
- TASK-012
- TASK-014
- TASK-015

## Worker Session Prompt Template

Copy/paste this into a new Worker Session and replace `TASK-xxx`.

```text
You are a Worker Session for the `superpower_trip_map` repo.

I want you to work on TASK-xxx.

Before doing anything:
1. Read `planning/CURRENT_STATE.md`.
2. Read `planning/TASKS.md`.
3. Read `planning/PARALLEL_WORK_PLAN.md`.
4. Read `planning/SESSION_ASSIGNMENT.md`.
5. Read the task's referenced Superpowers spec/plan if one exists.
6. If this is visual/UI work, read `DESIGN.md` before changing UI.
7. If this is non-trivial production code, follow `CLAUDE.md` review/test expectations.

Conflict rules:
- Do not take this task if another `in_progress` task modifies any of the same files.
- Do not edit `planning/CURRENT_STATE.md`, `planning/DECISIONS.md`, `planning/PARALLEL_WORK_PLAN.md`, or `planning/SESSION_ASSIGNMENT.md` unless the Manager explicitly tells you to.
- Do not delete or rewrite existing Superpowers docs/settings.
- Do not broaden the task scope.
- Do not make unrelated formatting churn.

Claiming:
- If and only if safe, update only the selected task's `Status` in `planning/TASKS.md` from `todo` to `in_progress`.
- If it is not safe, stop and explain the conflict.

Implementation:
- Work only on files listed in the task unless you discover a necessary adjacent file; mention any expansion in the handoff.
- Keep changes small and independently reviewable.
- Run targeted tests/checks. Run broader tests only if scope warrants it.

Completion:
- Do not update `planning/CURRENT_STATE.md` or global project state unless you are explicitly the Manager Session.
- Provide a handoff summary with:
  - Task ID and title
  - Status: completed / blocked / needs review
  - Modified files
  - What changed
  - Tests/checks run with exact commands and results
  - Known risks
  - Follow-up tasks
  - Manager decisions needed
- If blocked, list the exact blocker and recommended next Manager action.
```

## Handoff Summary Template

```md
# Handoff — TASK-xxx

## Status
completed | blocked | needs_review

## Modified Files
- `path/to/file`

## Summary
- ...

## Tests / Checks
- `command` — pass/fail and relevant output

## Risks / Notes
- ...

## Manager Decisions Needed
- ...

## Suggested Next Tasks
- ...
```
