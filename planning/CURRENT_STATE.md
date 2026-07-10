# Current State

Last updated: 2026-07-08
Manager-owned: yes. Worker sessions should not edit this file unless explicitly acting as the Manager Session.

## Repository Snapshot

- Project: `superpower_trip_map` / package name `superpowers_food_map`.
- Manager workspace: `D:\vibe_coding_project\food_map\superpowers_food_map`.
- Worker session workspaces are lane directories such as `superpowers_food_map-laneB`, `superpowers_food_map-laneC`, `superpowers_food_map-laneC2`, and `superpower_trip_map-laneC3`.
- Stack: Next.js 14 App Router, React 18, TypeScript, Tailwind, Jest, Playwright, Supabase, Google Maps/Places, Anthropic SDK.
- Primary product surface: itinerary editor (`app/itinerary/ItineraryClient.tsx`, `components/ItineraryDay.tsx`, `components/ItineraryCard.tsx`).
- Superpowers history exists under `docs/superpowers/**` and `.superpowers/sdd/**`.
- Existing Superpowers specs/plans are indexed for the Manager architecture in `planning/SUPERPOWERS_INDEX.md`.
- Design system is defined in `DESIGN.md`; all visual work must read it first.
- Project workflow instructions are defined in `CLAUDE.md`; non-trivial production code needs independent review per that file.
- Manager workflow is documented in `planning/MANAGER_WORKFLOW.md`. Required order: GStack product discovery, Superpowers engineering planning, GSD project management, parallel Worker execution, GStack review, Manager decision.
- Workspace roles are documented in `planning/WORKSPACES.md`.
- Planning docs are UTF-8 Markdown. On Windows/PowerShell, use explicit UTF-8 reading such as `Get-Content planning\DECISIONS.md -Encoding utf8` before relying on Traditional Chinese product copy.

## Existing Completed Capabilities

The `.superpowers/sdd/progress.md` ledger records completed SDD work, including:

- Initial itinerary planner foundation: setup, types, haversine, TSP, scheduler, Places action, input UI, itinerary display, map, drag/time editing, Claude summaries, recommendation pipeline, admin source management.
- Split itinerary/map layout.
- Cross-day drag.
- Google Maps embed and richer card info.
- Batch itinerary paste.
- Dessert type, split start/duration locks, late-exit and opening-hours warnings.
- Combined input.
- Accommodation scheduling and accommodation refinements.
- Calendar date controls and day windows.
- Per-day recommendations and recommendation backfill.
- Per-segment transport.
- Smart arrange, AI rearrange, free-time blocks.
- Lane C collaboration foundation: auth/persistence, sharing/members, candidate pool, candidate assignment.
- Warm Travel Journal restyle.
- Three-lock model baseline is present in production code: `ScheduledPlace.endLocked?`, `lib/utils/lockDerive.ts`, `ItineraryCard` start/duration/end lock controls.

## Current Production Shape Relevant to New Work

- `ScheduledPlace` has `startTime`, `durationMin`, `startLocked`, `durationLocked`, optional `endLocked`, and leg metadata.
- `ItineraryCard` currently renders start time, an arrow, and end time; duration is edited indirectly via end-time picker, not as a first-class middle field.
- `DayRecommendations` currently hides itself when a day/category has no recommendation data.
- `getDayRecommendations` runs per day, but recommendation center selection is currently centroid-based, not user-configurable per day.
- `Place` currently has one `name`, one `address`, and one `photoUrl`.
- `/admin` source management exists with add/list/delete basics.

## Active Brainstormed Product Direction

The following new product directions have been discussed in-session and should be treated as current intent until superseded. Existing related Superpowers specs are mapped in `planning/SUPERPOWERS_INDEX.md`.

1. Card time UX: `開始時間 -> 停留時間 -> 結束時間`; duration is a first-class picker, displayed as `1 小時 30 分`; max two manual locks; lodging shows `入住 -> 退房` and does not show duration recommendations.
2. Localized place names: display Traditional Chinese first, English second, original fallback; show secondary name only when different; only attractions may use AI translation; restaurants/shops should not be force-translated.
3. Recommendations: every day always shows a recommendation area; each category has 5 cards; per-day recommendation center can be set with Google Autocomplete and persisted; fallback uses manual center -> same-day centroid -> previous day center(s) -> trip centroid -> prompt user.
4. Upcoming brainstorm items still need formal decisions: top itinerary day-count stepper, bottom `+` day button, four Google photos/lightbox, Google Maps right-side drawer, fuller admin source management.

## Manager / Worker Operating Model

- Manager Session owns planning docs and Project State.
- Manager-owned planning state lives in `D:\vibe_coding_project\food_map\superpowers_food_map\planning`.
- Worker lane sessions should read Manager planning state from the Manager workspace, then implement in their own lane workspace.
- Manager starts new product work with GStack product discovery and does not implement during that phase.
- Manager uses Superpowers to create the durable engineering source of truth after product direction is approved.
- Manager uses GSD after engineering planning to create epics, features, tasks, dependencies, status buckets, and the Available Task Pool.
- Manager status display uses `$multi-status` for Active Spec Task Trees, Available Safe Tasks, Blocked, and Un Spec.
- New Worker Sessions use this fixed skill order: `$multi-new-session` -> `$multi-claim-task` -> Superpowers implement/debug/test -> `$multi-handoff-task`.
- Worker Sessions may claim tasks from `planning/TASKS.md` only after checking `planning/PARALLEL_WORK_PLAN.md` for conflicts.
- Worker Sessions should not update `planning/CURRENT_STATE.md`, `planning/ROADMAP.md`, `planning/DECISIONS.md`, `planning/PARALLEL_WORK_PLAN.md`, or cross-task status summaries unless explicitly told they are the Manager.
- Worker Sessions should provide handoff summaries for Manager integration.

## Known Constraints

- Do not delete or overwrite existing Superpowers settings or history.
- Do not assume fixed Backend/Frontend/Testing roles. Sessions are task-pool workers.
- Avoid concurrent edits to high-conflict orchestration files: `app/itinerary/ItineraryClient.tsx`, `lib/types.ts`, `app/actions/recommend.ts`, and shared card components.
- Docs-only work can usually run in parallel unless touching the same planning docs.
