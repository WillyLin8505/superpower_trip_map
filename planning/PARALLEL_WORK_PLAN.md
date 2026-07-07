# Parallel Work Plan

Last updated: 2026-07-07
Manager-owned: yes.

## Current Maximum Parallelism

Right now, maximum recommended parallel sessions: **3**.

Reason: most production tasks converge on a few shared high-conflict files (`app/itinerary/ItineraryClient.tsx`, `components/ItineraryCard.tsx`, `lib/types.ts`, `app/actions/recommend.ts`). Until specs are converted into implementation plans, safe parallel work is mostly docs/spec isolation.

## Safe Parallel Tasks Right Now

These can run together after TASK-001 is complete because they create mostly separate docs:

- TASK-002 — Spec 1 design doc
- TASK-003 — Spec 2 design doc
- TASK-004 — Spec 3 design doc
- TASK-016 — README onboarding refresh

Recommended cap even for docs: 3 sessions, because Manager must reconcile decisions.

## Do Not Run Together

- TASK-001 conflicts with all planning-doc edits because it bootstraps `planning/**`.
- TASK-006 conflicts with TASK-007 and TASK-012 because all modify `components/ItineraryCard.tsx`.
- TASK-006 conflicts with TASK-011 because both redesign card internals and media/time layout.
- TASK-007 conflicts with TASK-014/TASK-015 if both touch `app/itinerary/ItineraryClient.tsx` lock/day handlers.
- TASK-008 conflicts with TASK-009 and TASK-011 because all likely modify `lib/types.ts`.
- TASK-008 conflicts with TASK-010 because both affect recommendation cards and place data.
- TASK-009 conflicts with TASK-010 because TASK-010 depends on recommendation center data model from TASK-009.
- TASK-010 conflicts with TASK-014/TASK-015 because all modify `app/itinerary/ItineraryClient.tsx`.
- TASK-011 conflicts with TASK-012 because both modify itinerary and recommendation cards.
- TASK-014 conflicts with TASK-015; they should be same session or strictly sequential.

## Tasks That Must Finish First

- TASK-001 must finish before any Worker Session uses the task-pool workflow.
- TASK-002 must finish before TASK-006 or TASK-007.
- TASK-003 must finish before TASK-008 and should finish before TASK-011/TASK-012.
- TASK-004 must finish before TASK-009/TASK-010.
- TASK-009 must finish before TASK-010.
- TASK-005 should finish before TASK-013/TASK-014/TASK-015 because those need unresolved brainstorm decisions.

## Tasks Suitable for Any Session

Suitable after dependencies are met and no file conflict exists:

- TASK-002, TASK-003, TASK-004: docs-only spec formalization.
- TASK-016: README docs refresh.
- TASK-013: admin source management, after spec is written; isolated from itinerary editor.

## Tasks That Should Be Done Alone

- TASK-006 — card duration-first UI.
- TASK-007 — lock enforcement/lodging UI.
- TASK-008 — localized place resolution.
- TASK-009 — recommendation center data model.
- TASK-010 — recommendation center UI/fallback/refresh.
- TASK-011 — four photos and lightbox.
- TASK-012 — Google Maps drawer.
- TASK-014/TASK-015 — day-count and add-day controls, preferably same session.

## Tasks That Should Wait for Review

- Any task changing `lib/types.ts` should wait for spec review because it has broad fixture/test impact.
- Any task changing `app/itinerary/ItineraryClient.tsx` should wait for Manager approval if another task is active.
- Any visual/UI task should read `DESIGN.md` first and should be reviewed against the Warm Travel Journal system.
- Any non-trivial production code should follow `CLAUDE.md` cross-review requirements.

## Shared File Conflict Matrix

| File | Tasks likely touching it | Risk |
|---|---|---|
| `app/itinerary/ItineraryClient.tsx` | TASK-007, TASK-009, TASK-010, TASK-012, TASK-014, TASK-015 | high |
| `components/ItineraryCard.tsx` | TASK-006, TASK-007, TASK-008, TASK-011, TASK-012 | high |
| `components/RecommendationCard.tsx` | TASK-008, TASK-011, TASK-012 | high |
| `components/DayRecommendations.tsx` | TASK-010 | medium |
| `lib/types.ts` | TASK-008, TASK-009, TASK-011 | high |
| `app/actions/places.ts` | TASK-008, TASK-011 | high |
| `app/actions/recommend.ts` | TASK-010 | high |
| `components/admin/*` | TASK-013 | medium |
| `README.md` | TASK-016 | low |
| `planning/**` | TASK-001, TASK-005, Manager updates | high for coordination |

## Recommended Waves

### Wave 0 — Manager Setup

- TASK-001 only.

### Wave 1 — Specs / Docs Parallelization

Run up to three sessions from:

- TASK-002
- TASK-003
- TASK-004
- TASK-016

Manager reviews and updates `CURRENT_STATE.md`, `DECISIONS.md`, and task dependencies afterward.

### Wave 2 — Isolated or Sequential Implementation

Run at most one high-conflict itinerary editor implementation at a time:

1. TASK-006
2. TASK-007
3. TASK-008 or TASK-009, not together
4. TASK-010 after TASK-009

Admin work (TASK-013) may run in parallel with one itinerary task if it avoids shared files.

### Wave 3 — Rich Media / Drawer / Day Controls

After type/localization/card baselines settle:

- TASK-011
- TASK-012
- TASK-014/TASK-015

Run these mostly sequentially because they share card and itinerary client surfaces.
