# Superpowers Spec Index

Last updated: 2026-07-08
Manager-owned: yes.

This file maps existing Superpowers specs/plans into the Manager planning architecture. Planning docs coordinate sessions; Superpowers docs remain the durable engineering source of truth.

Source locations:

- Specs: `docs/superpowers/specs/`
- Plans: `docs/superpowers/plans/`
- Spikes and handoffs: `docs/superpowers/spikes/`
- SDD ledger: `.superpowers/sdd/progress.md`

## Current Answer

Existing completed Superpowers specs and plans are preserved in the repository, but they were only summarized in `planning/CURRENT_STATE.md` before this index. From now on, this file is the Manager-level bridge between the old Superpowers history and the new GStack -> Superpowers -> GSD -> Worker architecture.

## Manager Rules

- Do not delete or rewrite existing Superpowers specs/plans when creating new Manager tasks.
- Before marking a task as needing a new spec, check this index and `docs/superpowers/specs/`.
- If an existing spec covers part of a task, reference it in the task notes instead of duplicating it.
- If product direction has changed since an existing spec, create an addendum or replacement spec and link both the old and new docs.

## Active Spec Task Trees

```text
SPEC: Card Duration / Lock UI
├─ TASK-002 [Recently Handed Off · Review not_reviewed · worktree -laneB] Formalize Superpowers spec/addendum
│  └─ Output: `docs/superpowers/specs/2026-07-07-card-duration-lock-ui-design.md`
├─ TASK-006 [Available · run alone] Implement card duration-first time UI
└─ TASK-007 [Blocked by TASK-006] Implement lock enforcement and lodging-specific time UI
```

```text
SPEC: Place Localization
├─ TASK-003 [Recently Handed Off · Review not_reviewed · worktree -laneC] Formalize Superpowers spec
│  └─ Output: `docs/superpowers/specs/2026-07-07-place-localization-design.md`
├─ TASK-008 [Available · run alone] Implement localized place resolution
├─ TASK-011 [Blocked by likely TASK-008] Implement four Google photos per place and lightbox
└─ TASK-012 [Blocked by likely TASK-008] Implement Google Maps right-side place drawer
```

```text
SPEC: Recommendation Centers
├─ TASK-004 [Available Safe] Formalize Superpowers spec/addendum
│  └─ Output: `docs/superpowers/specs/2026-07-07-recommendation-centers-design.md`
├─ TASK-009 [Blocked by TASK-004] Implement per-day recommendation center data model and persistence
└─ TASK-010 [Blocked by TASK-004, TASK-009] Implement recommendation center UI, fallback, and refresh
```

```text
SPEC: Remaining Roadmap Product Decisions
├─ TASK-005 [Un Spec / Manager-owned] Continue brainstorm and formalize remaining roadmap items
├─ TASK-013 [Blocked by TASK-005] Improve admin source management
├─ TASK-014 [Blocked by TASK-005] Top itinerary day-count stepper
└─ TASK-015 [Blocked by TASK-005, likely TASK-014] Bottom add-day button
```

```text
SPEC: Project Onboarding Documentation
└─ TASK-016 [Available Safe] Review and refresh README for project-specific onboarding
```

```text
SPEC: Lane C / C5 LINE Group Candidate Ingest
└─ TASK-021 [In Progress · worktree -laneB] Formalize C5 LINE group candidate ingest spec
   ├─ Output: docs/superpowers/specs/2026-07-07-laneC-c5-line-group-candidate-ingest-design.md
   └─ Depends on: Lane C C2 sharing, C3 candidate pool, C4 candidate arrange
```

## Active New Work Mapping

| Manager Task | Status in New Architecture | Existing Superpowers Context | Manager Decision |
|---|---|---|---|
| TASK-002 - Card duration-first time UI spec | Done by handoff; review optional | `2026-06-28-split-time-lock-design.md`, `2026-06-26-time-picker-lock-scheduler-itinerary-input-design.md`, `2026-07-03-accommodation-card-refinements-design.md` | Existing specs cover split locks and accommodation behavior, but not the new three-facet `start + duration + end` UI. TASK-006 may claim after conflict check. |
| TASK-003 - Localized place display spec | Done by handoff; review optional | No direct existing localization spec found | TASK-008 may claim after conflict check. |
| TASK-004 - Recommendation center spec | Needs new spec/addendum | `2026-06-30-per-day-recommendations-design.md`, `2026-07-02-recommendation-backfill-design.md` | Existing specs cover per-day recommendations and backfill, but not persisted per-day centers and refresh semantics. TASK-004 remains valid. |
| TASK-014 - Top itinerary day-count stepper | Existing partial spec exists | `2026-07-04-input-day-stepper-design.md` | Existing spec is for the input page only, not itinerary editor top controls. TASK-014 still needs product confirmation or an addendum. |
| TASK-015 - Bottom add-day button | Needs new spec/addendum | Related to `2026-07-04-input-day-stepper-design.md` only by day-count concept | TASK-015 remains blocked by TASK-005. |

## Completed Historical Specs

These specs/plans are historical Superpowers work and are considered part of the engineering record for the new Manager architecture:

| Capability | Spec | Plan |
|---|---|---|
| Initial itinerary planner | `docs/superpowers/specs/2026-06-25-itinerary-planner-design.md` | `docs/superpowers/plans/2026-06-25-itinerary-planner.md` |
| Vercel deploy and fixes | `docs/superpowers/specs/2026-06-25-vercel-deploy-and-fixes-design.md` | `docs/superpowers/plans/2026-06-25-vercel-deploy-and-fixes.md` |
| Google Maps embed/card info | `docs/superpowers/specs/2026-06-26-google-maps-routing-and-card-info-design.md` | `docs/superpowers/plans/2026-06-26-google-maps-embed-and-card-info.md` |
| Split itinerary layout | `docs/superpowers/specs/2026-06-26-itinerary-split-layout-design.md` | `docs/superpowers/plans/2026-06-26-itinerary-split-layout.md` |
| Cross-day drag | `docs/superpowers/specs/2026-06-26-cross-day-drag-design.md` | `docs/superpowers/plans/2026-06-26-cross-day-drag.md` |
| Dessert/lock/late-exit behavior | `docs/superpowers/specs/2026-06-26-dessert-type-lock-time-late-exit.md` | `docs/superpowers/plans/2026-06-26-dessert-lock-late-exit.md` |
| Time picker/lock/scheduler input | `docs/superpowers/specs/2026-06-26-time-picker-lock-scheduler-itinerary-input-design.md` | `docs/superpowers/plans/2026-06-26-time-picker-lock-scheduler-itinerary-input.md` |
| Combined input | `docs/superpowers/specs/2026-06-27-combined-input-design.md` | `docs/superpowers/plans/2026-06-27-combined-input.md` |
| Accommodation scheduling | `docs/superpowers/specs/2026-06-28-accommodation-scheduling-design.md` | `docs/superpowers/plans/2026-06-28-accommodation-scheduling.md` |
| Accommodation type tag | `docs/superpowers/specs/2026-06-28-accommodation-type-tag-design.md` | `docs/superpowers/plans/2026-06-28-accommodation-type-tag.md` |
| Calendar dates | `docs/superpowers/specs/2026-06-28-calendar-dates-design.md` | `docs/superpowers/plans/2026-06-28-calendar-dates.md` |
| Crowd data layer | `docs/superpowers/specs/2026-06-28-crowd-data-layer-design.md` | `docs/superpowers/plans/2026-06-28-crowd-data-layer.md` |
| Split time lock | `docs/superpowers/specs/2026-06-28-split-time-lock-design.md` | `docs/superpowers/plans/2026-06-28-split-time-lock.md` |
| Timeline view | `docs/superpowers/specs/2026-06-28-timeline-view-design.md` | `docs/superpowers/plans/2026-06-28-timeline-view-laneB.md` |
| Per-day recommendations | `docs/superpowers/specs/2026-06-30-per-day-recommendations-design.md` | `docs/superpowers/plans/2026-06-30-per-day-recommendations.md` |
| Per-segment transport | `docs/superpowers/specs/2026-06-30-per-segment-transport-design.md` | `docs/superpowers/plans/2026-06-30-per-segment-transport.md` |
| Smart arrange | `docs/superpowers/specs/2026-06-30-smart-arrange-design.md` | `docs/superpowers/plans/2026-06-30-smart-arrange.md` |
| Free-time blocks | `docs/superpowers/specs/2026-07-01-free-time-blocks-design.md` | `docs/superpowers/plans/2026-07-01-free-time-blocks.md` |
| Lane C auth/persistence | `docs/superpowers/specs/2026-07-01-laneC-c1-auth-persistence-design.md` | `docs/superpowers/plans/2026-07-01-laneC-c1-auth-persistence.md` |
| AI rearrange | `docs/superpowers/specs/2026-07-02-ai-rearrange-design.md` | `docs/superpowers/plans/2026-07-02-ai-rearrange.md` |
| Recommendation backfill | `docs/superpowers/specs/2026-07-02-recommendation-backfill-design.md` | `docs/superpowers/plans/2026-07-02-recommendation-backfill.md` |
| Accommodation card refinements | `docs/superpowers/specs/2026-07-03-accommodation-card-refinements-design.md` | `docs/superpowers/plans/2026-07-03-accommodation-card-refinements.md` |
| Lane C sharing/membership | `docs/superpowers/specs/2026-07-03-laneC-c2-sharing-membership-design.md` | `docs/superpowers/plans/2026-07-03-laneC-c2-sharing-membership.md` |
| Input page day stepper | `docs/superpowers/specs/2026-07-04-input-day-stepper-design.md` | No matching plan found |
| Warm Journal restyle | `docs/superpowers/specs/2026-07-04-itinerary-warm-journal-restyle-design.md` | `docs/superpowers/plans/2026-07-04-itinerary-warm-journal-restyle.md` |
| Lane C candidate pool | `docs/superpowers/specs/2026-07-04-laneC-c3-candidate-pool-design.md` | `docs/superpowers/plans/2026-07-04-laneC-c3-candidate-pool.md` |
| Lane C candidate assignment | `docs/superpowers/specs/2026-07-05-laneC-c4-candidate-arrange-design.md` | `docs/superpowers/plans/2026-07-05-laneC-c4-candidate-arrange.md` |
| Lane C roadmap | `docs/superpowers/specs/2026-07-01-laneC-roadmap.md` | N/A |

## Known Gaps

- `docs/superpowers/plans/2026-06-26-batch-itinerary-paste.md` exists without a matching design spec in `docs/superpowers/specs/`.
- `docs/superpowers/specs/2026-07-04-input-day-stepper-design.md` exists without a matching plan.
- New product decisions in `planning/DECISIONS.md` DEC-101 to DEC-305 still need completed Superpowers specs before implementation. TASK-002 and TASK-003 are done by handoff; TASK-004 still needs formalization.
