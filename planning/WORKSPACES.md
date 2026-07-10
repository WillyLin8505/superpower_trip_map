# Workspace Roles

Last updated: 2026-07-08
Manager-owned: yes.

## Manager Workspace

The Manager workspace is:

```text
D:\vibe_coding_project\food_map\superpowers_food_map
```

This workspace owns the planning source of truth:

- `planning/CURRENT_STATE.md`
- `planning/TASKS.md`
- `planning/ROADMAP.md`
- `planning/DECISIONS.md`
- `planning/PARALLEL_WORK_PLAN.md`
- `planning/SESSION_ASSIGNMENT.md`
- `planning/HANDOFF.md`
- `planning/WORKSPACES.md`

Only the Manager should update these files unless explicitly delegating a planning edit.

## Worker Session Workspaces

All lane workspaces are Worker session workspaces.

Known Worker lanes:

- `D:\vibe_coding_project\food_map\superpowers_food_map-laneB`
- `D:\vibe_coding_project\food_map\superpowers_food_map-laneC`
- `D:\vibe_coding_project\food_map\superpowers_food_map-laneC2`
- `D:\vibe_coding_project\food_map\superpower_trip_map-laneC3`

Workers should implement code in their lane workspace, but they should read task state from the Manager workspace planning files.

## Required Worker Flow

Every Worker session uses:

```text
$multi-new-session -> $multi-claim-task -> Superpowers implement/debug/test -> $multi-handoff-task
```

Worker sessions must not treat lane-local planning files as the source of truth if Manager planning exists at:

```text
D:\vibe_coding_project\food_map\superpowers_food_map\planning
```
