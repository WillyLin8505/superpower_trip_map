# Session Assignment

Last updated: 2026-07-08
This project uses a task pool. Sessions do not have fixed Backend/Frontend/Testing roles.

Manager workspace: `D:\vibe_coding_project\food_map\superpowers_food_map`.
Worker sessions run in lane workspaces and read planning state from the Manager workspace.

## Encoding Rule

Planning docs are UTF-8 Markdown and include Traditional Chinese product copy. Worker sessions on Windows/PowerShell must read planning files with explicit UTF-8 handling:

```powershell
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$OutputEncoding = [System.Text.UTF8Encoding]::new()
Get-Content D:\vibe_coding_project\food_map\superpowers_food_map\planning\DECISIONS.md -Encoding utf8
```

If Chinese text or symbols look garbled, retry with explicit UTF-8 before making decisions or editing files.

## Assignment Rule

Any Worker Session may take any task if all are true:

1. The task status is `todo` in `planning/TASKS.md`.
2. All dependencies are `done` or explicitly waived by the Manager.
3. Conflict risk is `low` or `medium`, unless the Manager explicitly assigns a high-risk task.
4. No current `in_progress` task lists overlapping `Files likely to change`.
5. The task's `Safe to assign to any session` field is `yes`, or Manager explicitly assigns it.
6. The product direction has passed GStack discovery when the task represents new product behavior.
7. The task has a Superpowers spec/plan when the implementation is non-trivial or spans multiple sessions.

## Task Visibility Buckets

Manager status should present work in these buckets via `$multi-status`:

1. **In Progress Tasks**: tasks already marked `in_progress` in `planning/TASKS.md`. These show what other sessions are currently doing and which files are effectively locked.
2. **Available Safe Tasks**: Manager-created `todo` tasks that satisfy dependencies, have acceptable conflict risk, have no locked-file overlap, and are safe to assign directly.
3. **Blocked**: Manager-created tasks that cannot run because one or more other unfinished tasks must complete first.
4. **Un Spec**: product ideas or feature areas that do not yet have completed GStack decisions, Superpowers spec/plan, and GSD task breakdown. These are Manager planning work, not Worker implementation work.

Do not mix `Blocked` and `Un Spec`: if a task exists but waits for another task, it is `Blocked`; if no finished spec/task breakdown exists, it is `Un Spec`.

`$multi-new-session` is intentionally narrower: it should only show `In Progress Tasks` and locked files so a Worker can avoid collisions before claiming a Manager-assigned task.

For cross-Codex / Claude collaboration, `$multi-status` should show `Active Sessions / In Progress Tasks` first, including owning worktree/session and locked files when known.

Use `$multi-status` to see the full board. Use `$multi-claim-task` without a task ID to list claimable non-conflicting tasks. Use `$multi-claim-task TASK-xxx` after selecting one task; it is the final safety gate that checks completed dependencies, recent handoffs, blocked state, in-progress conflicts, and locked-file overlap before the Worker starts implementation.

Use `$multi-auto-spec` when the Manager needs to create a complete spec package from a product idea: office-hours -> Superpowers brainstorming -> Superpowers writing-plans -> GSD plan phase.

Use `$multi-auto-session` only when the Manager intentionally wants to process one selected spec tree through repeated claim -> TDD -> verification -> handoff cycles. It must still use `$multi-claim-task` for each task and must stop on blockers, conflicts, failed verification, or Manager/user input needs.

## Available Task Pool

### Safe Parallel Tasks

Available after TASK-001 is done:

- TASK-004 - Formalize Spec 3 as Superpowers-ready design doc
- TASK-016 - Review and refresh README for project-specific onboarding

Available after TASK-002/TASK-003 handoff is marked `done`:

- TASK-006 - Card duration-first time UI, if run alone and `$multi-claim-task` finds no conflict.
- TASK-008 - Localized place resolution, if run alone and `$multi-claim-task` finds no conflict.

### Conditional Parallel Tasks

- TASK-013 - Admin source management can run in parallel with itinerary work after its spec is written and if no other session touches `app/actions/sources.ts`, `components/admin/*`, or `app/admin/page.tsx`.

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

Use skills in this fixed order:
1. $multi-new-session
2. $multi-claim-task
3. Superpowers implement/debug/test workflow
4. $multi-handoff-task

Before doing anything:
0. On Windows/PowerShell, set UTF-8 output and read planning docs with `Get-Content -Encoding utf8` so Traditional Chinese decisions render correctly.
1. Read `D:\vibe_coding_project\food_map\superpowers_food_map\planning\CURRENT_STATE.md`.
2. Read `D:\vibe_coding_project\food_map\superpowers_food_map\planning\TASKS.md`.
3. Read `D:\vibe_coding_project\food_map\superpowers_food_map\planning\PARALLEL_WORK_PLAN.md`.
4. Read `D:\vibe_coding_project\food_map\superpowers_food_map\planning\SESSION_ASSIGNMENT.md`.
5. Read `D:\vibe_coding_project\food_map\superpowers_food_map\planning\WORKSPACES.md`.
6. Read `D:\vibe_coding_project\food_map\superpowers_food_map\planning\MANAGER_WORKFLOW.md` for the required GStack -> Superpowers -> GSD Manager workflow.
7. Read the task's referenced Superpowers spec/plan if one exists.
8. If this is visual/UI work, read `DESIGN.md` before changing UI.
9. If this is non-trivial production code, follow `CLAUDE.md` review/test expectations.

Conflict rules:
- Do not take this task if another `in_progress` task modifies any of the same files.
- Do not edit `planning/CURRENT_STATE.md`, `planning/ROADMAP.md`, `planning/DECISIONS.md`, or `planning/SESSION_ASSIGNMENT.md` unless the Manager explicitly tells you to.
- Do not edit `planning/PARALLEL_WORK_PLAN.md` during claim or implementation. `$multi-handoff-task` may remove only the current task's lock and add/update only the current task's `Recently Handed Off` note.
- Do not delete or rewrite existing Superpowers docs/settings.
- Do not broaden the task scope.
- Do not make unrelated formatting churn.

Claiming:
- If and only if safe, update only the selected task's `Status` in `planning/TASKS.md` from `todo` to `in_progress`.
- Candidate discovery can happen through `$multi-status` for the full board or `$multi-claim-task` without a task ID for claimable-only options.
- Claiming with `TASK-xxx` validates and reserves exactly one selected task.
- Before claiming, verify completed dependencies, recently handed-off tasks, blocked state, in-progress task conflicts, and locked-file overlap.
- If you are not allowed to edit planning files, output a claim request for the Manager and stop until the claim is confirmed.
- If it is not safe, stop and explain the conflict.

Implementation:
- Work only on files listed in the task unless you discover a necessary adjacent file; mention any expansion in the handoff.
- Keep changes small and independently reviewable.
- Follow the referenced Superpowers plan as the engineering source of truth. If the plan is wrong, stop and ask the Manager instead of re-planning the feature.
- Run targeted tests/checks. Run broader tests only if scope warrants it.

Completion:
- Do not update `planning/CURRENT_STATE.md`, `planning/ROADMAP.md`, or `planning/DECISIONS.md` unless you are explicitly the Manager Session.
- Use $multi-handoff-task to produce the final handoff.
- `$multi-handoff-task` may update only the current task's status in `planning/TASKS.md`, append to `planning/HANDOFF.md`, and remove only the current task's lock from `planning/PARALLEL_WORK_PLAN.md`.
- Do not unlock downstream tasks or regenerate Available Safe Tasks; Manager does that after review.
- Provide a handoff summary with:
  - Task ID and title
  - Status: completed / blocked / needs review
  - Modified files
  - What changed
  - Tests/checks run with exact commands and results
  - Known risks
  - Follow-up tasks
  - Manager decisions needed
- For non-trivial production code, request or run GStack-style review/challenge before the Manager accepts the work.
- If blocked, list the exact blocker and recommended next Manager action.
```

## Handoff Summary Template

```md
# Handoff - TASK-xxx

## Status
completed | blocked | needs_review

## Modified Files
- `path/to/file`

## Summary
- ...

## Tests / Checks
- `command` - pass/fail and relevant output

## Risks / Notes
- ...

## Manager Decisions Needed
- ...

## Suggested Next Tasks
- ...
```
