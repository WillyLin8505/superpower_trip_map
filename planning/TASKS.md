# Task Registry

Last updated: 2026-07-11
Manager-owned status registry and single source of truth. Worker Sessions may mark a task `in_progress` when claiming it and may mark only their own current task `done` or `blocked` during `$multi-handoff-task`.

Status values: `todo`, `in_progress`, `blocked`, `done`.

Source of truth path: `D:\vibe_coding_project\food_map\superpowers_food_map\planning\TASKS.md`.

Worker flow: `$multi-new-session` -> `$multi-claim-task` -> Superpowers implement/debug/test -> `$multi-handoff-task`.

Product flow: GStack Product Discovery -> Superpowers Engineering Planning -> GSD Project Management -> Parallel Worker Assignment -> Worker Execution -> GStack Review -> Manager Decision.

## Required Task Fields

Every Manager-created task should define:

- Task ID and Description in the task heading.
- Priority.
- Spec for every implementation task.
- Dependencies.
- Estimated scope.
- Files likely to change.
- Conflict risk.
- Can run in parallel?
- Required review.

Implementation task invariant: if `Task type` is `frontend` or `backend`, and `Spec:` is `none`/missing or points to a missing file under `docs/superpowers/specs/`, the task is Un Spec and not claimable.

## Locked Files

- `lib/types.ts` — TASK-011, claimed 2026-07-11 (`$multi-auto-session` SPEC: Place Photos Lightbox).
- `app/actions/places.ts` — TASK-011, claimed 2026-07-11.
- `app/api/photo/route.ts` — TASK-011, claimed 2026-07-11.
- `components/ItineraryCard.tsx` — TASK-011, claimed 2026-07-11.
- `components/RecommendationCard.tsx` — TASK-011, claimed 2026-07-11.
- `components/PhotoLightbox.tsx` — TASK-011, claimed 2026-07-11.
- `photo/card tests` — TASK-011, claimed 2026-07-11.

## Spec Trees

- SPEC: Manager Workflow — TASK-001, TASK-005, TASK-017, TASK-018, TASK-019, TASK-020
- SPEC: Card Duration / Lock UI — TASK-002, TASK-006, TASK-007
- SPEC: Place Localization — TASK-003, TASK-008
- SPEC: Recommendation Centers — TASK-004, TASK-009, TASK-010
- SPEC: Place Photos Lightbox — TASK-011
- SPEC: Place Drawer — TASK-012
- SPEC: Admin Source Management — TASK-013
- SPEC: Itinerary Editor Day Count — TASK-014
- SPEC: Bottom Add-Day Flow — TASK-015
- SPEC: README Onboarding — TASK-016
- SPEC: LINE Group Candidate Ingest — TASK-021

## Conflicts

- TASK-006 <> TASK-007: both modify card time/lock behavior.
- TASK-006 <> TASK-011: both modify itinerary card internals and media/time layout.
- TASK-006 <> TASK-012: both modify itinerary card interaction surfaces.
- TASK-007 <> TASK-014: both may touch itinerary day/time handlers in `app/itinerary/ItineraryClient.tsx`.
- TASK-007 <> TASK-015: both may touch itinerary day/time handlers in `app/itinerary/ItineraryClient.tsx`.
- TASK-008 <> TASK-009: both may modify `lib/types.ts`.
- TASK-008 <> TASK-011: both may modify `lib/types.ts` and place photo data.
- TASK-008 <> TASK-010: both affect recommendation cards and place data.
- TASK-009 <> TASK-010: TASK-010 depends on TASK-009's recommendation center data model.
- TASK-010 <> TASK-014: both modify `app/itinerary/ItineraryClient.tsx`.
- TASK-010 <> TASK-015: both modify `app/itinerary/ItineraryClient.tsx`.
- TASK-011 <> TASK-012: both modify itinerary/recommendation card surfaces.
- TASK-014 <> TASK-015: same day-count/add-day control area; run sequentially.

## Un Spec

- None currently derived for non-done implementation tasks. If a future frontend/backend task has `Spec: none`, `Spec: TBD`, or a missing spec file, run `$multi-auto-spec` before `$multi-auto-session`.

## TASK-001 - Create multi-session planning and orchestration docs

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `planning/CURRENT_STATE.md`
  - `planning/TASKS.md`
  - `planning/DECISIONS.md`
  - `planning/PARALLEL_WORK_PLAN.md`
  - `planning/SESSION_ASSIGNMENT.md`
  - `planning/HANDOFF.md`
- Dependencies: none
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: no
- Required review: Manager review
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Manager bootstrap task. Do not run concurrent planning-doc edits while this is active.

## TASK-002 - Formalize Spec 1 as Superpowers-ready design doc

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `docs/superpowers/specs/2026-07-07-card-duration-lock-ui-design.md`
  - possibly `docs/superpowers/plans/2026-07-07-card-duration-lock-ui.md`
- Dependencies: TASK-001
- Blocking tasks: TASK-006, TASK-007
- Conflict risk: low
- Can run in parallel: yes
- Required review: Manager review; GStack optional because docs-only
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only. Must preserve decisions in `planning/DECISIONS.md` DEC-101 to DEC-105. Completed in worktree `superpowers_food_map-laneB` (`lane/ai-research`); handoff recorded 2026-07-09. Review is optional unless explicitly reopened or blocked.

## TASK-003 - Formalize Spec 2 as Superpowers-ready design doc

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `docs/superpowers/specs/2026-07-07-place-localization-design.md`
  - possibly `docs/superpowers/plans/2026-07-07-place-localization.md`
- Dependencies: TASK-001
- Blocking tasks: TASK-008
- Conflict risk: low
- Can run in parallel: yes
- Required review: Manager review; GStack optional because docs-only
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only. Must preserve DEC-201 to DEC-203. Completed in worktree `superpowers_food_map-laneC` (`lane/c1-auth-persistence`); handoff recorded 2026-07-09. Review is optional unless explicitly reopened or blocked.

## TASK-004 - Formalize Spec 3 as Superpowers-ready design doc

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `docs/superpowers/specs/2026-07-07-recommendation-centers-design.md`
  - possibly `docs/superpowers/plans/2026-07-07-recommendation-centers.md`
- Dependencies: TASK-001
- Blocking tasks: TASK-009, TASK-010
- Conflict risk: low
- Can run in parallel: yes
- Required review: Manager review; GStack optional because docs-only
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only. Must reconcile with existing `docs/superpowers/specs/2026-06-30-per-day-recommendations-design.md`. Completed in worktree `superpowers_food_map-laneB`; handoff recorded 2026-07-09, review status `not_reviewed`. Review is optional unless explicitly reopened or blocked.

## TASK-005 - Continue brainstorm and formalize remaining roadmap items

- Task type: docs
- Status: done
- Priority: medium
- Estimated scope: medium
- Files likely to change:
  - `planning/TASKS.md`
  - `planning/DECISIONS.md`
  - new `docs/superpowers/specs/2026-07-07-*.md`
- Dependencies: TASK-001
- Blocking tasks: future implementation tasks for day stepper, add-day button, photos, map drawer, admin enhancements
- Conflict risk: medium
- Can run in parallel: no
- Required review: GStack product discovery before new implementation tasks are created
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Manager should own because it mutates task registry and decisions.

## TASK-006 - Implement card duration-first time UI

- Task type: frontend
- Status: done
- Priority: high
- Spec: `docs/superpowers/specs/2026-06-26-time-picker-lock-scheduler-itinerary-input-design.md`
- Estimated scope: medium
- Files likely to change:
  - `components/ItineraryCard.tsx`
  - `components/TimeScrollPicker.tsx`
  - possibly new `components/DurationScrollPicker.tsx`
  - `lib/utils/timeEdit.ts`
  - `__tests__/itinerary-card-*.test.tsx`
  - `__tests__/time-utils.test.ts` or new duration-format tests
- Dependencies: TASK-002
- Blocking tasks: TASK-007
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: High-conflict shared card UI. Handoff accepted as completed by Manager direction; review is optional unless explicitly reopened or blocked.

## TASK-007 - Implement lock enforcement and lodging-specific time UI

- Task type: frontend
- Status: done
- Priority: high
- Spec: `docs/superpowers/specs/2026-07-05-three-lock-model-design.md`
- Estimated scope: medium
- Files likely to change:
  - `components/ItineraryCard.tsx`
  - `lib/utils/lockDerive.ts`
  - `lib/utils/timeEdit.ts`
  - `app/itinerary/ItineraryClient.tsx`
  - `__tests__/lock-derive.test.ts`
  - `__tests__/itinerary-lock-invariant.test.tsx`
- Dependencies: TASK-002, TASK-006
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Conflicts with TASK-006. Should run after duration UI shape is settled.

## TASK-008 - Implement localized place resolution

- Task type: backend
- Status: done
- Priority: high
- Spec: `docs/superpowers/specs/2026-07-01-laneC-c1-auth-persistence-design.md`
- Estimated scope: large
- Files likely to change:
  - `lib/types.ts`
  - `app/actions/places.ts`
  - `components/PlaceSearch.tsx`
  - `components/CombinedInput.tsx`
  - `components/RecommendationCard.tsx`
  - `components/ItineraryCard.tsx`
  - AI extraction actions/tests
  - place/recommendation/search tests
- Dependencies: TASK-003
- Blocking tasks: TASK-011, TASK-012
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Touches `lib/types.ts` and shared card/search surfaces. Completed in worktree `superpowers_food_map-laneC` (`lane/c1-auth-persistence`); handoff recorded 2026-07-09, review status `not_reviewed`. Implemented optional localized fields, centralized fallback helpers, Google/search/recommendation preservation, and localized display surfaces.

## TASK-009 - Implement per-day recommendation center data model and persistence

- Task type: backend
- Status: done
- Priority: high
- Spec: `docs/superpowers/specs/2026-06-30-per-day-recommendations-design.md`
- Estimated scope: medium
- Files likely to change:
  - `lib/types.ts`
  - `app/actions/trips.ts`
  - `app/itinerary/ItineraryClient.tsx`
  - relevant trip/session tests
- Dependencies: TASK-004
- Blocking tasks: TASK-010
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Data model change in `DayItinerary`; conflicts with localization/type tasks.

## TASK-010 - Implement recommendation center UI, fallback, and refresh

- Task type: frontend
- Status: done
- Priority: high
- Spec: `docs/superpowers/specs/2026-06-30-per-day-recommendations-design.md`
- Estimated scope: large
- Files likely to change:
  - `components/DayRecommendations.tsx`
  - `components/ItineraryDay.tsx`
  - `app/itinerary/ItineraryClient.tsx`
  - `app/actions/recommend.ts`
  - `lib/utils/dayRecommend.ts`
  - recommendation tests
- Dependencies: TASK-004, TASK-009
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: High-conflict recommendation pipeline and itinerary client work.

## TASK-011 - Implement four Google photos per place and lightbox

- Task type: frontend
- Status: in_progress
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-10-place-photos-lightbox-design.md`
- Estimated scope: large
- Files likely to change:
  - `lib/types.ts`
  - `app/actions/places.ts`
  - `app/api/photo/route.ts`
  - `components/ItineraryCard.tsx`
  - `components/RecommendationCard.tsx`
  - possibly new `components/PhotoLightbox.tsx`
  - photo/card tests
- Dependencies: TASK-003, TASK-008
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Wait for localization/type changes to avoid repeated `Place` migrations.

## TASK-012 - Implement Google Maps right-side place drawer

- Task type: frontend
- Status: todo
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-10-place-drawer-design.md`
- Estimated scope: medium
- Files likely to change:
  - `components/ItineraryCard.tsx`
  - `components/RecommendationCard.tsx`
  - possibly new `components/MapPlaceDrawer.tsx`
  - `app/itinerary/ItineraryClient.tsx`
  - drawer/card tests
- Dependencies: TASK-003, TASK-008
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Conflicts with card duration and photo tasks because all touch card components.

## TASK-013 - Improve admin source management

- Task type: frontend
- Status: done
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-10-admin-source-management-design.md`
- Estimated scope: medium
- Files likely to change:
  - `app/admin/page.tsx`
  - `components/admin/SourceForm.tsx`
  - `components/admin/SourceList.tsx`
  - `app/actions/sources.ts`
  - `config/sources.json` or source storage tests
- Dependencies: none
- Blocking tasks: none
- Conflict risk: medium
- Can run in parallel: yes
- Required review: GStack review if production code changes are non-trivial
- Suggested session count: 1
- Safe to assign to any session: yes, after spec is written
- Notes: Relatively isolated from itinerary editor. Spec exists at `docs/superpowers/specs/2026-07-10-admin-source-management-design.md`; do not run concurrently with another admin/source task.

## TASK-014 - Top itinerary day-count stepper

- Task type: frontend
- Status: done
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-09-itinerary-editor-day-count-stepper-design.md`
- Estimated scope: small (revised down after spec — reuses existing `handleChangeEndDate`/`handleDeleteDay`/`handleScatterDay`/overCount banner wholesale; no new state, action, or deletion logic)
- Files likely to change:
  - `app/itinerary/ItineraryClient.tsx`
  - `__tests__/itinerary-date-controls.test.tsx`
- Dependencies: none
- Blocking tasks: TASK-015
- Conflict risk: medium (file is on the shared conflict matrix, but current diff is small and isolated to one JSX block + two imports)
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: yes, if no current `ItineraryClient.tsx` lock exists
- Notes: Spec formalized via `$multi-auto-spec` (office-hours -> superpowers:brainstorming): `docs/superpowers/specs/2026-07-09-itinerary-editor-day-count-stepper-design.md`. Implementation plan: `docs/superpowers/plans/2026-07-09-itinerary-editor-day-count-stepper.md`. Previous `in_progress` claim was stale; no active session owns this task.

## TASK-015 - Bottom add-day button

- Task type: frontend
- Status: done
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-10-bottom-add-day-flow-design.md`
- Estimated scope: small
- Files likely to change:
  - `app/itinerary/ItineraryClient.tsx`
  - day/date tests
- Dependencies: TASK-014
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review if production code changes are non-trivial
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Shares add/remove day logic with TASK-014; run after TASK-014 unless Manager explicitly combines both in one selected spec. DONE 2026-07-11: implemented in worktree `claude_lane_a`, branch `task-015-bottom-add-day` off current `origin/main` (includes TASK-014's merged stepper, `6815eb5`). Added "+ 加一天" / "↑ 回到頂部" buttons after the last day card, reusing `handleChangeEndDate(addDays(dayDate(plan.startDate, N), 1))` verbatim (zero new state/logic) plus a native `window.scrollTo`. TDD: 4 new tests in `__tests__/itinerary-date-controls.test.tsx`, RED confirmed before implementation, GREEN after (11/11 in file). Full suite 113/113 suites, 571/571 tests. `tsc --noEmit` clean (no new errors). `next build` succeeds. Pushed and opened **PR #12** (https://github.com/WillyLin8505/superpower_trip_map/pull/12).

## TASK-016 - Review and refresh README for project-specific onboarding

- Task type: docs
- Status: done
- Priority: low
- Estimated scope: small
- Files likely to change:
  - `README.md`
- Dependencies: TASK-001
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: yes
- Required review: Manager review
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only and isolated. Completed in worktree `superpowers_food_map-laneC` (`lane/c1-auth-persistence`); handoff recorded 2026-07-09, review status `not_reviewed`. Replaced default README with project-specific onboarding and removed corrupted duplicate title bytes.

## TASK-017 - Document Manager workflow for GSD, GStack, and Superpowers

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `planning/MANAGER_WORKFLOW.md`
  - `planning/SESSION_ASSIGNMENT.md`
  - `planning/CURRENT_STATE.md`
- Dependencies: TASK-001
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: no
- Required review: Manager review
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Manager clarification task responding to workflow usage questions.

## TASK-018 - Align Manager workflow docs with GStack -> Superpowers -> GSD process

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `planning/MANAGER_WORKFLOW.md`
  - `planning/SESSION_ASSIGNMENT.md`
  - `planning/CURRENT_STATE.md`
  - `planning/DECISIONS.md`
  - `planning/PARALLEL_WORK_PLAN.md`
  - `planning/TASKS.md`
  - `planning/HANDOFF.md`
  - `planning/ROADMAP.md`
- Dependencies: TASK-017
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: no
- Required review: Manager review
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Manager correction task. Canonical workflow is GStack product discovery, Superpowers engineering planning, GSD project management, Worker execution, GStack review, Manager decision.

## TASK-019 - Create Worker session lifecycle skills

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `C:/Users/sssss/.codex/skills/multi-new-session/SKILL.md`
  - `C:/Users/sssss/.codex/skills/multi-claim-task/SKILL.md`
  - `C:/Users/sssss/.codex/skills/multi-handoff-task/SKILL.md`
  - `planning/MANAGER_WORKFLOW.md`
  - `planning/SESSION_ASSIGNMENT.md`
  - `planning/CURRENT_STATE.md`
  - `planning/DECISIONS.md`
  - `planning/HANDOFF.md`
- Dependencies: TASK-018
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: no
- Required review: Manager review
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Defines the fixed Worker lifecycle: multi-new-session -> multi-claim-task -> Superpowers implement/debug/test -> multi-handoff-task.

## TASK-020 - Create Superpowers spec inventory index

- Task type: docs
- Status: done
- Priority: high
- Estimated scope: small
- Files likely to change:
  - `planning/SUPERPOWERS_INDEX.md`
  - `planning/CURRENT_STATE.md`
  - `planning/ROADMAP.md`
  - `planning/MANAGER_WORKFLOW.md`
- Dependencies: TASK-001, TASK-018
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: no
- Required review: Manager review
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Manager integration task. Maps existing `docs/superpowers/**` specs/plans into the new planning architecture so completed specs are not lost or duplicated.

## TASK-021 - Formalize Lane C / C5 LINE group candidate ingest as Superpowers-ready design doc

- Task type: docs
- Status: done
- Priority: medium
- Estimated scope: small
- Files likely to change:
  - `docs/superpowers/specs/2026-07-07-laneC-c5-line-group-candidate-ingest-design.md`
  - possibly `docs/superpowers/plans/2026-07-07-laneC-c5-line-group-candidate-ingest.md`
- Dependencies: Lane C C2 sharing/membership, C3 candidate pool, C4 candidate arrange
- Blocking tasks: C5 implementation (not yet registered)
- Conflict risk: low
- Can run in parallel: yes
- Required review: Manager review; GStack optional because docs-only
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Merged into the registry 2026-07-08 by Manager from a previously un-tracked draft. Previous `in_progress` claim was stale; no active session owns this task. LINE bot ingests group-shared places / Google Maps links / article URLs into C3 `trip_candidates` after a group is bound to a trip.
