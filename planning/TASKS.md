# Task Registry

Last updated: 2026-07-07
Manager-owned status registry. Worker Sessions may mark a task `in_progress` only when claiming it and must avoid conflicts described here and in `PARALLEL_WORK_PLAN.md`.

Status values: `todo`, `in_progress`, `blocked`, `done`.

## TASK-001 — Create multi-session planning and orchestration docs

- Task type: docs
- Status: done
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
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Manager bootstrap task. Do not run concurrent planning-doc edits while this is active.

## TASK-002 — Formalize Spec 1 as Superpowers-ready design doc

- Task type: docs
- Status: todo
- Estimated scope: small
- Files likely to change:
  - `docs/superpowers/specs/2026-07-07-card-duration-lock-ui-design.md`
  - possibly `docs/superpowers/plans/2026-07-07-card-duration-lock-ui.md`
- Dependencies: TASK-001
- Blocking tasks: TASK-006, TASK-007
- Conflict risk: low
- Can run in parallel: yes
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only. Must preserve decisions in `planning/DECISIONS.md` DEC-101 to DEC-105.

## TASK-003 — Formalize Spec 2 as Superpowers-ready design doc

- Task type: docs
- Status: todo
- Estimated scope: small
- Files likely to change:
  - `docs/superpowers/specs/2026-07-07-place-localization-design.md`
  - possibly `docs/superpowers/plans/2026-07-07-place-localization.md`
- Dependencies: TASK-001
- Blocking tasks: TASK-008
- Conflict risk: low
- Can run in parallel: yes
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only. Must preserve DEC-201 to DEC-203.

## TASK-004 — Formalize Spec 3 as Superpowers-ready design doc

- Task type: docs
- Status: todo
- Estimated scope: small
- Files likely to change:
  - `docs/superpowers/specs/2026-07-07-recommendation-centers-design.md`
  - possibly `docs/superpowers/plans/2026-07-07-recommendation-centers.md`
- Dependencies: TASK-001
- Blocking tasks: TASK-009, TASK-010
- Conflict risk: low
- Can run in parallel: yes
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only. Must reconcile with existing `docs/superpowers/specs/2026-06-30-per-day-recommendations-design.md`.

## TASK-005 — Continue brainstorm and formalize remaining roadmap items

- Task type: docs
- Status: todo
- Estimated scope: medium
- Files likely to change:
  - `planning/TASKS.md`
  - `planning/DECISIONS.md`
  - new `docs/superpowers/specs/2026-07-07-*.md`
- Dependencies: TASK-001
- Blocking tasks: future implementation tasks for day stepper, add-day button, photos, map drawer, admin enhancements
- Conflict risk: medium
- Can run in parallel: no
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Manager should own because it mutates task registry and decisions.

## TASK-006 — Implement card duration-first time UI

- Task type: frontend
- Status: todo
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
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: High-conflict shared card UI. Should be done alone after spec review.

## TASK-007 — Implement lock enforcement and lodging-specific time UI

- Task type: frontend
- Status: todo
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
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Conflicts with TASK-006. Should run after duration UI shape is settled.

## TASK-008 — Implement localized place resolution

- Task type: backend
- Status: todo
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
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Touches `lib/types.ts` and shared card/search surfaces. Should be implemented after doc review.

## TASK-009 — Implement per-day recommendation center data model and persistence

- Task type: backend
- Status: todo
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
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Data model change in `DayItinerary`; conflicts with localization/type tasks.

## TASK-010 — Implement recommendation center UI, fallback, and換一批

- Task type: frontend
- Status: todo
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
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: High-conflict recommendation pipeline and itinerary client work.

## TASK-011 — Implement four Google photos per place and lightbox

- Task type: frontend
- Status: todo
- Estimated scope: large
- Files likely to change:
  - `lib/types.ts`
  - `app/actions/places.ts`
  - `app/api/photo/route.ts`
  - `components/ItineraryCard.tsx`
  - `components/RecommendationCard.tsx`
  - possibly new `components/PhotoLightbox.tsx`
  - photo/card tests
- Dependencies: TASK-003, likely TASK-008
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Wait for localization/type changes to avoid repeated `Place` migrations.

## TASK-012 — Implement Google Maps right-side place drawer

- Task type: frontend
- Status: todo
- Estimated scope: medium
- Files likely to change:
  - `components/ItineraryCard.tsx`
  - `components/RecommendationCard.tsx`
  - possibly new `components/MapPlaceDrawer.tsx`
  - `app/itinerary/ItineraryClient.tsx`
  - drawer/card tests
- Dependencies: TASK-003, likely TASK-008
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Conflicts with card duration and photo tasks because all touch card components.

## TASK-013 — Improve admin source management

- Task type: frontend
- Status: todo
- Estimated scope: medium
- Files likely to change:
  - `app/admin/page.tsx`
  - `components/admin/SourceForm.tsx`
  - `components/admin/SourceList.tsx`
  - `app/actions/sources.ts`
  - `config/sources.json` or source storage tests
- Dependencies: TASK-005 or additional admin brainstorm decisions
- Blocking tasks: none
- Conflict risk: medium
- Can run in parallel: yes
- Suggested session count: 1
- Safe to assign to any session: yes, after spec is written
- Notes: Relatively isolated from itinerary editor. Do not run concurrently with another admin/source task.

## TASK-014 — Top itinerary day-count stepper

- Task type: frontend
- Status: todo
- Estimated scope: medium
- Files likely to change:
  - `app/itinerary/ItineraryClient.tsx`
  - `lib/utils/date.ts`
  - date-control tests
- Dependencies: TASK-005
- Blocking tasks: TASK-015
- Conflict risk: high
- Can run in parallel: no
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Needs brainstorm/spec. Conflicts with recommendation center work in `ItineraryClient`.

## TASK-015 — Bottom add-day button

- Task type: frontend
- Status: todo
- Estimated scope: small
- Files likely to change:
  - `app/itinerary/ItineraryClient.tsx`
  - day/date tests
- Dependencies: TASK-005, likely TASK-014
- Blocking tasks: none
- Conflict risk: high
- Can run in parallel: no
- Suggested session count: 1
- Safe to assign to any session: no
- Notes: Shares add/remove day logic with TASK-014; should be same session or after TASK-014.

## TASK-016 — Review and refresh README for project-specific onboarding

- Task type: docs
- Status: todo
- Estimated scope: small
- Files likely to change:
  - `README.md`
- Dependencies: TASK-001
- Blocking tasks: none
- Conflict risk: low
- Can run in parallel: yes
- Suggested session count: 1
- Safe to assign to any session: yes
- Notes: Docs-only and isolated. Should not touch planning state.
