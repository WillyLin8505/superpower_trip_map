# Task Registry

Last updated: 2026-07-12
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
- SPEC: Archive & Tabbed Panel — TASK-022
- SPEC: Edit-Time Cascade — TASK-023
- SPEC: Per-Trip Cost Badge — TASK-024
- SPEC: Google API Cost Reduction — TASK-025, TASK-026, TASK-027

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
- TASK-022 <> TASK-011: both modify itinerary/recommendation card internals (archive button vs photo layout).
- TASK-022 <> TASK-012: light — both add a button to the same card components (`ItineraryCard`/`RecommendationCard`/`CandidatePanel`); no layout clash since TASK-012 is now just an external Google Maps link.
- TASK-023 <> TASK-006/TASK-007/TASK-014/TASK-015: all touch `app/itinerary/ItineraryClient.tsx` time/day handlers and/or the scheduler; TASK-023 is run-alone (core scheduler change). Do not run concurrently with any itinerary-editor task.
- TASK-024 <> TASK-022/TASK-023: TASK-024 shares `ItineraryDay.tsx`/`ItineraryClient.tsx` (badge) with TASK-022 and `legs.ts` (tripId threading) with TASK-023; both done, so no active clash, but run TASK-024 solo since it threads through many server actions.

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

## TASK-011 - Implement five Google photos per place and lightbox

- Task type: frontend
- Status: done
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
- Notes: Done 2026-07-12 in worktree `superpowers_food_map-task011`, branch `codex/task-011-place-photos`. Added `photoUrls?: string[]`, Google photo mapping up to five photos, reusable `PhotoStrip`/`PhotoLightbox`, fixed-position lightbox arrows, and card integrations with click-to-enlarge behavior. Review status `not_reviewed`.

## TASK-012 - Open place in Google Maps (new tab)

- Task type: frontend
- Status: done
- Priority: low
- Spec: `docs/superpowers/specs/2026-07-12-open-place-in-google-maps-design.md`
- Estimated scope: small
- Files likely to change:
  - `lib/utils/mapUrl.ts` (`buildPlaceMapsUrl`)
  - `components/ItineraryCard.tsx` / `components/CardContent.tsx`
  - `components/RecommendationCard.tsx`
  - `components/CandidatePanel.tsx`
  - `__tests__/map-url.test.ts`, card tests
- Dependencies: none
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: yes
- Required review: GStack review if non-trivial
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: REDEFINED 2026-07-12: was "right-side place drawer" (spec never written — dangling ref). User changed it to "click a card → open Google Maps search for that place in a new tab" (external `maps.google.com` URL via `place_id`; no API key, no cost, no in-app drawer). This removes the layout overlap with TASK-022 (the 3-tab side panel now owns the right column). Only a light conflict with TASK-022 remains: both add a button to the same card components. DONE 2026-07-12: implemented in worktree `claude_lane_a`, branch `task-012-google-maps-link` off current `origin/main` (post TASK-022 merge, `334ace6`). Added `buildPlaceMapsUrl(place)` (official `api=1` Maps Search URL, `query_place_id` when available, name/address fallback) and wired a "🗺️ 在 Google Maps 開啟" link into `ItineraryCard`, `RecommendationCard`, `CandidatePanel` next to the existing archive/delete buttons. `CardContent.tsx`/`TimelineCard.tsx` intentionally skipped — no existing action-button row there, matching the precedent TASK-022's archive button already set. TDD: RED confirmed for 4 new tests before implementation, GREEN after. Found and fixed a real regression during verification: 14 pre-existing test files fully `jest.mock('@/lib/utils/mapUrl', ...)` with only `buildDayEmbedUrl`, which crashed `ItineraryCard` once it called the new `buildPlaceMapsUrl` unconditionally — added the missing mock export to all 14. Full suite 123/123 suites, 626/626 tests. `tsc --noEmit` clean. `next build` succeeds. Pushed and opened **PR #15** (https://github.com/WillyLin8505/superpower_trip_map/pull/15).

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

## TASK-022 - Archive parking-lot + 3-tab side panel + map relayout

- Task type: frontend
- Status: done
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-12-archive-and-tabbed-panel-design.md`
- Dependencies: C5 `trip_candidates` (done, on main)
- Estimated scope: large
- Files likely to change:
  - `supabase/migrations/0006_archive_list.sql`
  - `lib/types.ts` (`TripCandidate.list`)
  - `app/actions/candidates.ts` (or new `app/actions/archive.ts`): `archivePlace` / `listArchived` / `unarchivePlace`
  - `lib/candidates.ts`
  - `components/ItineraryCard.tsx`, `components/RecommendationCard.tsx`, `components/CandidatePanel.tsx` (archive button)
  - new `components/SidePanel.tsx` (3-tab: 推薦 / LINE 討論 / 封存)
  - `components/ItineraryDay.tsx` (map below AI summary; side panel same height)
  - `app/itinerary/ItineraryClient.tsx` (archive/unarchive handlers)
  - `__tests__/archive-actions.test.ts`, `__tests__/card-archive-button.test.tsx`, `__tests__/side-panel.test.tsx`, `__tests__/itinerary-day-layout.test.tsx`
- Conflict risk: high (shares card + itinerary-day layout with TASK-011/TASK-012)
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: yes (spec/plan complete)
- Notes: Spec/plan via `$multi-auto-spec` 2026-07-12. Decisions DEC-501..DEC-506. Plan: `docs/superpowers/plans/2026-07-12-archive-and-tabbed-panel.md`. Archive = per-trip parking-lot reusing `trip_candidates` + a `list` column (`candidate`/`archived`); place-level, re-addable. Do not run concurrently with TASK-011/TASK-012 (shared card/layout surfaces). DONE 2026-07-12: implemented in isolated worktree off `origin/main` (branch `task-022-archive-tabbed-panel`). Migration renamed `0006` → `0007_archive_list.sql` (`0006_invite_codes.sql` already existed on main). Did NOT touch `lib/types.ts`/`lib/candidates.ts` — used the existing simpler `Candidate` type (already what `CandidatePanel`/`app/actions/candidates.ts` actually use in production; `TripCandidate`/`lib/candidates.ts` are LINE-ingest-only and unused by any UI) rather than the spec's assumed `TripCandidate` extension. Corrected a real bug in `archivePlace`'s own design mid-implementation: duplicate-key on insert now flips the existing row's `list` to `'archived'` instead of a silent no-op (a plain no-op would mean archiving an already-existing LINE candidate never actually archives it). `components/DayCandidateSuggestions.tsx` + `lib/utils/candidateArrange.ts` + their tests are now dead code (kept, not deleted) — the per-day geographic candidate suggestions they provided are superseded by the trip-wide LINE 討論 tab, which intentionally shows the same list in every day (DEC-503). Verified: `tsc --noEmit` clean (same pre-existing baseline, plus confirmed the `line-bindings.test.ts`/`line-candidates.test.ts` collision already existed on clean `main` before this work), `npm test` 121/121 suites / 616/616 tests, `next build` succeeds. Pushed and opened **PR #14** (https://github.com/WillyLin8505/superpower_trip_map/pull/14). **MERGED to `main` 2026-07-12** (commit `334ace6`); reverified 121/121 suites / 618/618 tests green on `main` post-merge via a fresh worktree. **Migration `0007_archive_list.sql` still needs to be manually applied to the live Supabase project** — archive won't work in production until then.

## TASK-023 - Edit-time cascade (soft anchor + neighbor yield)

- Task type: frontend
- Status: done
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-14-edit-time-cascade-design.md`
- Dependencies: TASK-022 (done — unlocks `app/itinerary/ItineraryClient.tsx`)
- Estimated scope: medium-large
- Files likely to change:
  - `lib/utils/timeEdit.ts` (new `applyTimeEditCascade`)
  - `lib/utils/clientScheduler.ts` (treat edited card as per-recalc soft anchor; leading card yields end, not start)
  - `app/itinerary/ItineraryClient.tsx` (`handleTimeChange` calls the cascade)
  - `__tests__/time-edit-cascade.test.ts`, `__tests__/itinerary-client-time-edit.test.tsx` (new)
- Conflict risk: high (core scheduling; shares `ItineraryClient.tsx` time handlers + touches scheduler used by all lock tests)
- Can run in parallel: no (run alone — core scheduler change)
- Required review: GStack review + challenge (tricky scheduling boundaries) per CLAUDE.md
- Suggested session count: 1
- Safe to assign to any session: yes (spec/plan complete)
- Notes: Spec/plan via `$multi-auto-spec`-style flow 2026-07-14 (office-hours/brainstorm collapsed — user gave product decisions directly via AUQ and confirmed root-cause understanding). Decisions DEC-601..DEC-606. Plan: `docs/superpowers/plans/2026-07-14-edit-time-cascade.md`. Root cause: `recalcDay` recomputes unlocked cards' start from day-start, so editing an unlocked card's start snaps back (verified against `client-scheduler.test.ts`). New model: editing start/end = transient anchor (no manual lock); previous card's end aligns to the edited start keeping travel time; clamp to duration 0 on inversion; symmetric both directions; explicit 3-locks still win. Run alone: touches the scheduler that ~10 lock/schedule test files depend on — only ADD tests, do not change existing test semantics. DONE 2026-07-14: implemented in isolated worktree `/tmp/claude-1000/task-023-cascade`, branch `task-023-edit-time-cascade` off `origin/main` (`278957a`). Added `applyTimeEditCascade` to `lib/utils/timeEdit.ts` (new function, `applyTimeEdit` kept unchanged and reused internally). Deliberately did **not** modify `lib/utils/clientScheduler.ts` — the plan's own closing paragraph explicitly authorizes keeping the lock-driven path (`recalcDay`) and the edit-soft-anchor path separate; `ItineraryClient.tsx`'s `handleTimeChange` now calls `applyTimeEditCascade` directly and bypasses the debounced `recalcPlan`/`scheduleRecalc` pipeline entirely for this interaction (same bypass pattern already used by `toggleLockField`), so `clientScheduler.ts` never sees the edited value and Step 2 of the plan (scheduler anchor integration) became unnecessary under this design. Tests: `__tests__/time-edit-cascade.test.ts` (10 new, pure-function, all of spec §4/§7/§8) + `__tests__/itinerary-client-time-edit.test.tsx` (new, component-level, drives a real `TimeScrollPicker` through `ItineraryClient` and asserts the cascade reaches the DOM while `recalcPlan` is never called — plan Step 3's required coverage). Verified: targeted `time-edit-cascade client-scheduler end-lock-schedule itinerary-lock-invariant itinerary-client-time-edit` 28/28 tests across 5 suites (zero regressions to existing hard-lock semantics), full suite 129/129 suites / 646/646 tests, `tsc --noEmit` clean (same pre-existing baseline, now also excluding a pre-existing implicit-`any` in `candidates-actions.test.ts`'s `makeMembershipAccessBuilder` unrelated to this change — worth a small follow-up fix), `next build` succeeds. Pushed and opened **PR #16** (https://github.com/WillyLin8505/superpower_trip_map/pull/16). **Flagged per CLAUDE.md for a GStack/codex review pass before merge** given the "tricky scheduling logic" gate — not yet run. **MERGED to `main` 2026-07-14** (commit `62b08b1`, squash). **Post-merge collision found and fixed:** another independently-developed and independently-merged PR had added an identical module-level `timeToMin(time: string): number` helper to the same file at a different insertion point — no textual conflict, but the duplicate top-level declaration broke SWC's transform for every test importing `ItineraryClient` (17 suites failed to parse). Caught during the mandatory post-merge `main` reverification (not by CI). Fixed by removing the redundant duplicate (functionally identical to mine) in isolated worktree `/tmp/claude-1000/verify-main`, verified 134/134 suites / 660/660 tests, `tsc --noEmit` clean, `next build` succeeds, pushed and merged **PR #17** (https://github.com/WillyLin8505/superpower_trip_map/pull/17, commit `b73e3a5`). Reverified clean on `main` again after: 134/134 suites / 660/660 tests green.

## TASK-024 - Per-trip estimated Google API cost badge

- Task type: frontend
- Status: done
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-15-per-trip-cost-meter-design.md`
- Dependencies: `0010_cost_control_foundation.sql` (`api_usage_events` table + `trackedApiFetch`, already on main — must be applied to live Supabase)
- Estimated scope: medium
- Files likely to change:
  - `lib/apiUsageEvents.ts` (or new `app/actions/apiUsage.ts`): `getTripEstimatedCostUsd(tripId)`
  - `app/actions/places.ts`, `app/actions/directions.ts` (add `tripId` param → `trackedApiFetch` usage)
  - `app/actions/legs.ts`, `app/actions/arrange.ts`, `app/actions/plan.ts`, `app/actions/recommend.ts` (thread current `tripId` down)
  - `app/api/photo/route.ts`, `app/api/place-photos/route.ts` (attribute tripId if available)
  - new `components/TripCostBadge.tsx`; wire into `components/ItineraryDay.tsx` / `app/itinerary/ItineraryClient.tsx`
  - `__tests__/trip-cost.test.ts`, `__tests__/api-usage-trip-attribution.test.ts`, `__tests__/trip-cost-badge.test.tsx`
- Conflict risk: medium-high (threads through many server actions; shares `ItineraryDay.tsx`/`ItineraryClient.tsx` with TASK-022, `legs.ts` with TASK-023)
- Can run in parallel: no
- Required review: GStack review after implementation
- Suggested session count: 1
- Safe to assign to any session: yes (spec/plan complete)
- Notes: Spec/plan via `$multi-auto-spec`-style flow 2026-07-15 (user gave product decisions via AUQ: Google Maps only, show estimated money, per-trip, next to itinerary). Decisions DEC-701..DEC-706. Plan: `docs/superpowers/plans/2026-07-15-per-trip-cost-meter.md`. ~70% of backend already exists from the cost-control work (commit `278957a` + migration `0010`): `api_usage_events` table with `trip_id` + `estimated_cost_usd` + `(trip_id, created_at)` index, `estimateApiUsageCostUsd`, and `trackedApiFetch` already wrapping every Google call. Gaps this task fills: (1) call sites don't pass `tripId` yet → events are `trip_id=null`; (2) no per-trip aggregation query; (3) no UI badge; (4) ensure `0010` applied to live Supabase. Estimate, not real bill — badge must be labeled 「估算」. Biggest risk = threading `tripId` through the Google call chains (some pre-binding searches legitimately have no trip → record null). Non-goals: Anthropic cost, whole-app/per-user dashboards, real billing reconciliation, charging users. **DONE 2026-07-16** (PR #18, squash `8e4c2b7`). Implemented in worktree off `origin/main`: `lib/apiUsageContext.ts` (AsyncLocalStorage trip context + `tripIdFromReferer`), `getTripEstimatedCostUsd` (paginated), tripId threaded via context into recommendations/legs/arrange/place-details, photo routes + LINE ingest attributed (photos via same-origin path-anchored Referer), `components/TripCostBadge.tsx` seeded from server-rendered `initialCostUsd` and refreshed after each spend action. Codex review: 3 rounds, all findings fixed, final PASS (explicit-null precedence, paginated undercount, arrange/place-details/photo/LINE attribution, stale-closure tripId, nested-context erasure, Referer spoof hardening). Verified 146 suites / 698 tests green, `tsc` clean on changed source, `next build` succeeds. **Ops: migration `0010_cost_control_foundation.sql` must be applied to live Supabase or nothing is recorded (badge shows US$0.00).**

## TASK-025 - Cache Nearby Search + place-photo metadata

- Task type: backend
- Status: done
- Priority: high
- Spec: none (data-driven cost optimization; no design spec)
- Dependencies: TASK-024 (api_usage_events data revealed the waste)
- Estimated scope: small
- Files changed: `lib/googleCache.ts` (new), `app/actions/places.ts` (nearbySearch), `app/api/place-photos/route.ts`, `jest.config.ts`, `__stubs__/next-cache.js`, `__tests__/google-cache.test.ts`
- Conflict risk: low
- Required review: GStack review
- Notes: **DONE 2026-07-16** (PR #20, squash `eacb2a4`). Live `api_usage_events` showed force-cache is ignored inside Server Actions → Nearby Search 89% exact repeats (~US$6.46 ≈ 65% of spend), place_photos_metadata 91% repeats. `cachedGoogle` wraps results in the Next Data Cache keyed by inputs; hit = no Google call/cost/event, miss runs in-context (TASK-024 attribution preserved). Transient statuses (`RETRYABLE_GOOGLE_STATUSES`) throw so failures aren't cached. Codex PASS (2 rounds). 150 suites / 719 tests green; build ok.

## TASK-026 - Cache getPlaceDetails

- Task type: backend
- Status: done
- Priority: high
- Spec: none (cost optimization)
- Dependencies: TASK-025 (`cachedGoogle` helper)
- Estimated scope: small
- Files changed: `app/actions/places.ts` (getPlaceDetails + fetchPlaceDetails), `__tests__/google-cache.test.ts`
- Conflict risk: low
- Required review: GStack review
- Notes: **DONE 2026-07-16** (PR #21, squash `e0cbe10`). 52% of place_details_pro ($17/1000) calls were exact repeats. Wrapped in `cachedGoogle` keyed by (placeId, name hint); fetchPlaceDetails throws on transient status (not cached); getPlaceDetails catches → returns null (preserves the null-on-failure contract callers rely on) and mints a fresh id per call. Codex PASS (2 rounds). 722 tests green.

## TASK-027 - On-demand OSM Overpass backfill (free recommendations)

- Task type: backend
- Status: done
- Priority: high
- Spec: none (approach chosen via AUQ 2026-07-16: on-demand OSM Overpass backfill)
- Dependencies: TASK-025 (`cachedGoogle`), `poi_places` table (migration `0010`)
- Estimated scope: medium
- Files changed: `lib/overpass.ts` (new), `lib/poiBackfill.ts` (new), `app/actions/recommend.ts`, `__tests__/overpass.test.ts`, `__tests__/poi-backfill.test.ts`
- Conflict risk: low
- Required review: GStack review
- Notes: **DONE 2026-07-17** (PR #22, squash `e32e7fa`). `poi_places` was empty → recommendations always hit paid Google Nearby Search ($32/1000, biggest cost). Now when open data is insufficient, backfill the area from the free OSM Overpass API (no key) in the **background** via `next/server` `after()` (dynamic-imported), deduped per rounded cell per 30d via the Data Cache; best-effort (Overpass/DB failures throw inside the cached fetcher so a failed backfill isn't cached, and are swallowed so recommendations always fall back to Google). Self-populates the areas users search — no migration, no upfront bulk load. Codex PASS (3 rounds: failure-not-cached, non-blocking latency, jsdom static-import). 152 suites / 736 tests green; build ok. Optional env `OVERPASS_API_URL`. Rollout: first visit to an area still uses Google + schedules backfill; later visits (anyone) served free.
