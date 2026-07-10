# Roadmap

Last updated: 2026-07-08
Manager-owned: yes.

This roadmap is maintained by the Manager after GSD project management and after accepted Worker handoffs. Workers may read this file for context but must not update it unless explicitly acting as Manager.

Source of truth path: `D:\vibe_coding_project\food_map\superpowers_food_map\planning\ROADMAP.md`.

## Workflow Source Of Truth

Canonical Manager flow:

```text
GStack Product Discovery
-> Superpowers Engineering Planning
-> GSD Project Management
-> Parallel Worker Assignment
-> Worker Execution
-> GStack Review
-> Manager Decision
```

Existing Superpowers specs/plans are part of this architecture through `planning/SUPERPOWERS_INDEX.md`; active spec-to-task trees are shown there.

## Active Epic

### EPIC-001 - Multi-session itinerary product evolution

Goal: evolve the itinerary planner through deterministic specs, safe task boundaries, and parallel Worker execution without creating merge conflicts in shared itinerary surfaces.

Current status: planning and task-pool preparation.

## Feature Groups

### FEATURE-001 - Card time and lock UX

- Related tasks: TASK-002, TASK-006, TASK-007.
- Product discovery: captured in `planning/DECISIONS.md` DEC-101 to DEC-105.
- Engineering plan: TASK-002 handed off and marked done; related historical specs are indexed in `planning/SUPERPOWERS_INDEX.md`.
- Parallel status: TASK-006 can be claimed after `$multi-claim-task` confirms no conflicts; implementation tasks should run sequentially.

### FEATURE-002 - Localized place display

- Related tasks: TASK-003, TASK-008.
- Product discovery: captured in `planning/DECISIONS.md` DEC-201 to DEC-203.
- Engineering plan: TASK-003 handed off and marked done; no direct historical localization spec found in `planning/SUPERPOWERS_INDEX.md`.
- Parallel status: TASK-008 can be claimed after `$multi-claim-task` confirms no conflicts; implementation should run alone because it touches shared place types and cards.

### FEATURE-003 - Per-day recommendations and centers

- Related tasks: TASK-004, TASK-009, TASK-010.
- Product discovery: captured in `planning/DECISIONS.md` DEC-301 to DEC-305.
- Engineering plan: pending Superpowers spec/plan formalization; related historical recommendation specs are indexed in `planning/SUPERPOWERS_INDEX.md`.
- Parallel status: blocked until TASK-004 is done; TASK-009 must finish before TASK-010.

### FEATURE-004 - Remaining brainstorm items

- Related tasks: TASK-005, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015.
- Product discovery: pending GStack challenge and Manager decisions.
- Engineering plan: pending Superpowers specs/plans.
- Parallel status: not available until TASK-005 resolves product direction.

## Current Work Buckets

### In Progress Tasks

- TASK-021 - C5 LINE group candidate ingest spec: in progress in worktree `superpowers_food_map-laneB`.

### Recently Handed Off

- TASK-002 - Card duration/lock UI spec: completed in laneB, review status `not_reviewed`; review is optional and does not block TASK-006.
- TASK-003 - Place localization spec: completed in laneC, review status `not_reviewed`; review is optional and does not block TASK-008.

### Available Safe Tasks

Currently available for direct Worker assignment after Manager confirmation:

- TASK-006 - Card duration-first time UI: implement card `start -> duration -> end` controls; run alone after `$multi-claim-task` conflict check.
- TASK-008 - Localized place resolution: implement Traditional Chinese/English/original fallback across place data and UI; run alone after `$multi-claim-task` conflict check.
- TASK-004 - Recommendation center spec: formalize daily recommendation center selection, fallback, de-duplication, 5-card categories, and refresh behavior.
- TASK-016 - README onboarding refresh: update project-specific onboarding docs without touching product code.

### Blocked

- TASK-007 - Lock enforcement and lodging-specific time UI: enforce max-two-lock behavior and lodging `check-in -> check-out` display; blocked by TASK-006.
- TASK-009 - Recommendation center data model and persistence: store per-day recommendation centers; blocked by TASK-004.
- TASK-010 - Recommendation center UI, fallback, and refresh: implement center picker, fallback resolution, and `換一批`; blocked by TASK-004 and TASK-009.
- TASK-011 - Four Google photos per place and lightbox: add multiple place photos plus lightbox viewing; blocked by likely TASK-008 and shared type/card stabilization.
- TASK-012 - Google Maps right-side place drawer: show place details in a map-side drawer from cards/recommendations; blocked by likely TASK-008 and shared card stabilization.
- TASK-013 - Improve admin source management: expand `/admin` source CRUD/validation workflows; blocked by TASK-005 or admin product decisions.
- TASK-014 - Top itinerary day-count stepper: add itinerary editor controls for changing trip length; blocked by TASK-005 and shared `ItineraryClient` stabilization.
- TASK-015 - Bottom add-day button: add a bottom `+` flow for appending days; blocked by TASK-005 and likely TASK-014.

### Un Spec

The remaining brainstorm items still need Manager product discovery and/or completed Superpowers specs before implementation assignment:

- Itinerary editor day-count controls: confirm how top controls change itinerary length and interact with existing date/day behavior.
- Bottom add-day button flow: confirm bottom `+` behavior, placement, and relationship to top day-count controls.
- Four Google photos and lightbox: define photo count, data model, Google API handling, card layout, and lightbox UX.
- Google Maps right-side place drawer: define drawer trigger, content, map relationship, and card/recommendation interactions.
- Fuller admin source management: define source edit/delete/validation workflows and storage expectations.
