# Handoff Registry

Manager-visible handoff state for completed, blocked, or partial Worker tasks.

`planning/TASKS.md` is authoritative for task status, locked files, spec trees, and conflicts. This file records completion evidence, review status, and recent handoff context. Review is optional unless the Manager explicitly reopens or blocks a task.

## Handoff Protocol

Worker sessions append one record under `## Current Handoffs` during `$multi-handoff-task`.

Required fields:

- Task ID.
- Status: `done`, `partial`, or `blocked`.
- Review Status: `not_reviewed`, `gstack_review_requested`, `changes_requested`, or `accepted_by_manager`.
- Completed summary.
- Modified files.
- Tests run and result.
- Remaining work.
- Blockers.
- Risks / notes.
- Manager decisions needed.
- Suggested next task.
- Suggested commit message if code changed.

## Current Handoffs

### TASK-002 - Formalize Spec 1 as Superpowers-ready design doc

- Status: done
- Review Status: not_reviewed
- Completed: Card duration / lock UI spec formalization.
- Modified files: `docs/superpowers/specs/**`, possibly `docs/superpowers/plans/**`.
- Tests: docs-only; not run.
- Remaining work: implementation follow-up tracked by TASK-006 and TASK-007.
- Blockers: none.
- Risks / notes: review optional unless Manager reopens.
- Manager decisions needed: none.

### TASK-003 - Formalize Spec 2 as Superpowers-ready design doc

- Status: done
- Review Status: not_reviewed
- Completed: Place localization spec formalization.
- Modified files: `docs/superpowers/specs/**`, possibly `docs/superpowers/plans/**`.
- Tests: docs-only; not run.
- Remaining work: implementation follow-up tracked by TASK-008.
- Blockers: none.
- Risks / notes: review optional unless Manager reopens.
- Manager decisions needed: none.

### TASK-004 - Formalize Spec 3 as Superpowers-ready design doc

- Status: done
- Review Status: not_reviewed
- Completed: Recommendation center spec formalization.
- Modified files: `docs/superpowers/specs/**`, possibly `docs/superpowers/plans/**`.
- Tests: docs-only; not run.
- Remaining work: implementation follow-up tracked by TASK-009 and TASK-010.
- Blockers: none.
- Risks / notes: review optional unless Manager reopens.
- Manager decisions needed: none.

### TASK-006 - Implement card duration-first time UI

- Status: done
- Review Status: not_reviewed
- Completed: Card duration-first time UI handoff accepted by Manager direction.
- Modified files: see Worker handoff / branch diff.
- Tests: see Worker handoff / branch diff.
- Remaining work: TASK-007 lock enforcement and lodging-specific time UI.
- Blockers: none.
- Risks / notes: high-conflict card UI; review optional unless Manager reopens.
- Manager decisions needed: none.

### TASK-008 - Implement localized place resolution

- Status: done
- Review Status: not_reviewed
- Completed: Optional localized fields, centralized fallback helpers, Google/search/recommendation preservation, and localized display surfaces.
- Modified files: `lib/types.ts`, place/search/recommendation UI and action surfaces.
- Tests: see Worker handoff / branch diff.
- Remaining work: downstream photo/drawer/recommendation work may use localized place data.
- Blockers: none.
- Risks / notes: broad type-surface change; review optional unless Manager reopens.
- Manager decisions needed: none.

### TASK-016 - Review and refresh README for project-specific onboarding

- Status: done
- Review Status: not_reviewed
- Completed: Project-specific README onboarding refresh.
- Modified files: `README.md`.
- Tests: docs-only; not run.
- Remaining work: none.
- Blockers: none.
- Risks / notes: review optional unless Manager reopens.
- Manager decisions needed: none.

### TASK-015 - Bottom add-day button

- Status: done
- Review Status: not_reviewed
- Completed: Added "+ 加一天" / "↑ 回到頂部" buttons after the last day card in the itinerary editor, reusing TASK-014's `handleChangeEndDate(addDays(dayDate(plan.startDate, N), 1))` call verbatim (zero new state/logic) plus a native `window.scrollTo({ top: 0, behavior: 'smooth' })`.
- Modified files: `app/itinerary/ItineraryClient.tsx`, `__tests__/itinerary-date-controls.test.tsx`.
- Tests: `npx jest itinerary-date-controls --verbose` — RED confirmed (4 new tests failed for the right reason) before implementation, GREEN after (11/11 in file). `npm test` (full suite) — 113/113 suites, 571/571 tests, no regressions. `npx tsc --noEmit` — no new errors touching changed files. `npm run build` — succeeds.
- Remaining work: none for this task. TASK-012 (place drawer) is the remaining unclaimed spec'd task; also conflicts with TASK-011, currently in progress in another session.
- Blockers: none.
- Risks / notes: built in worktree `claude_lane_a`, branch `task-015-bottom-add-day`, off current `origin/main` (includes TASK-014's merged commit `6815eb5`). Manual diff review confirmed zero lines touched in existing handlers (`handleChangeEndDate`, `handleDeleteDay`, `handleScatterDay`, overCount banner). Pushed and opened PR #12: https://github.com/WillyLin8505/superpower_trip_map/pull/12. Not yet merged — Manager merge decision pending.
- Manager decisions needed: review/merge PR #12.

### TASK-011 - Implement four Google photos per place and lightbox

- Owner: superpowers_food_map-task011
- Status: done
- Review Status: not_reviewed
- Completed: Added optional `photoUrls?: string[]`, mapped up to four Google photo references in `getPlaceDetails` and `nearbySearch`, preserved `photoUrl` compatibility, added reusable `PhotoStrip` and `PhotoLightbox`, and integrated click-to-enlarge photo UI into itinerary and recommendation cards.
- Modified files: `lib/types.ts`, `app/actions/places.ts`, `components/PhotoLightbox.tsx`, `components/PhotoStrip.tsx`, `components/ItineraryCard.tsx`, `components/RecommendationCard.tsx`, `__tests__/nearby-search.test.ts`, `__tests__/places-details.test.ts`, `__tests__/photo-strip.test.tsx`, `__tests__/itinerary-card-photos.test.tsx`, `__tests__/recommendation-card-photos.test.tsx`.
- Tests: RED confirmed with `npm test -- __tests__/nearby-search.test.ts __tests__/places-details.test.ts __tests__/photo-strip.test.tsx __tests__/itinerary-card-photos.test.tsx __tests__/recommendation-card-photos.test.tsx --runInBand` failing for missing `photoUrls`, missing `PhotoStrip`, and missing card thumbnails. GREEN verified with `npm test -- __tests__/nearby-search.test.ts __tests__/places-details.test.ts __tests__/photo-strip.test.tsx __tests__/itinerary-card-photos.test.tsx __tests__/recommendation-card-photos.test.tsx __tests__/photo-route.test.ts __tests__/itinerary-card-info.test.tsx __tests__/recommendation-card.test.tsx --runInBand`: 8 suites, 27 tests passed. `git diff --check` passed with CRLF warnings only. `npx tsc --noEmit` was run and failed on unrelated pre-existing test type errors in line/member/trip test files, not TASK-011 files.
- Remaining work: none for TASK-011 implementation.
- Blockers: none.
- Risks / notes: Built in clean worktree `D:\vibe_coding_project\food_map\superpowers_food_map-task011` on branch `codex/task-011-place-photos` to avoid dirty laneB card diffs. `npm ci` installed dependencies in that worktree; npm reported 6 audit vulnerabilities inherited from current dependency set.
- Manager decisions needed: review TASK-011 diff and decide whether to merge branch `codex/task-011-place-photos`.
- Suggested next task: TASK-012 only after TASK-011 is reviewed/merged because both touch card surfaces.
- Suggested commit message: `feat: add multi-photo lightbox for place cards`
