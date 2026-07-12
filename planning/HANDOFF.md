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

### TASK-011 - Implement five Google photos per place and lightbox

- Owner: superpowers_food_map-task011
- Status: done
- Review Status: not_reviewed
- Completed: Added optional `photoUrls?: string[]`, mapped up to five Google photo references in `getPlaceDetails` and `nearbySearch`, preserved `photoUrl` compatibility, added reusable `PhotoStrip` and `PhotoLightbox`, fixed previous/next arrows to stable viewport positions, and integrated click-to-enlarge photo UI into itinerary and recommendation cards.
- Modified files: `lib/types.ts`, `app/actions/places.ts`, `components/PhotoLightbox.tsx`, `components/PhotoStrip.tsx`, `components/ItineraryCard.tsx`, `components/RecommendationCard.tsx`, `__tests__/nearby-search.test.ts`, `__tests__/places-details.test.ts`, `__tests__/photo-strip.test.tsx`, `__tests__/itinerary-card-photos.test.tsx`, `__tests__/recommendation-card-photos.test.tsx`.
- Tests: RED confirmed with `npm test -- __tests__/nearby-search.test.ts __tests__/places-details.test.ts __tests__/photo-strip.test.tsx __tests__/itinerary-card-photos.test.tsx __tests__/recommendation-card-photos.test.tsx --runInBand` failing for missing `photoUrls`, missing `PhotoStrip`, and missing card thumbnails. GREEN verified with `npm test -- __tests__/nearby-search.test.ts __tests__/places-details.test.ts __tests__/photo-strip.test.tsx __tests__/itinerary-card-photos.test.tsx __tests__/recommendation-card-photos.test.tsx __tests__/photo-route.test.ts __tests__/itinerary-card-info.test.tsx __tests__/recommendation-card.test.tsx --runInBand`: 8 suites, 27 tests passed. `git diff --check` passed with CRLF warnings only. `npx tsc --noEmit` was run and failed on unrelated pre-existing test type errors in line/member/trip test files, not TASK-011 files.
- Remaining work: none for TASK-011 implementation.
- Blockers: none.
- Risks / notes: Built in clean worktree `D:\vibe_coding_project\food_map\superpowers_food_map-task011` on branch `codex/task-011-place-photos` to avoid dirty laneB card diffs. `npm ci` installed dependencies in that worktree; npm reported 6 audit vulnerabilities inherited from current dependency set.
- Manager decisions needed: review TASK-011 diff and decide whether to merge branch `codex/task-011-place-photos`.
- Suggested next task: TASK-012 only after TASK-011 is reviewed/merged because both touch card surfaces.
- Suggested commit message: `feat: add multi-photo lightbox for place cards`

### TASK-022 - Archive parking-lot + 3-tab side panel + map relayout

- Status: done
- Review Status: not_reviewed
- Completed: `archivePlace`/`listArchived`/`unarchivePlace` reusing `trip_candidates` with a new `list` column (no new table). Archive button (📥, `aria-label="封存"`) on `ItineraryCard`, `RecommendationCard` (incl. inside `DayRecommendations`), and `CandidatePanel` per DEC-504. New `SidePanel` (3 tabs: 推薦行程 / LINE 討論 / 封存) replaces the bare `DayRecommendations` sidebar. `ItineraryDay` relayout: map moved to full-width below the AI summary; right column is `SidePanel`, `items-stretch` with the day column.
- Modified files: `app/actions/candidates.ts`, `app/itinerary/ItineraryClient.tsx`, `app/itinerary/[tripId]/page.tsx`, `components/CandidatePanel.tsx`, `components/DayRecommendations.tsx`, `components/ItineraryCard.tsx`, `components/ItineraryDay.tsx`, `components/RecommendationCard.tsx`, new `components/SidePanel.tsx`, new `supabase/migrations/0007_archive_list.sql` (renamed from spec's `0006`), plus new/updated tests (`candidates-actions`, `card-archive-button`, `itinerary-client-candidates`, `itinerary-day-layout`, `side-panel`, `trip-page*`).
- Tests: `npx tsc --noEmit` clean (pre-existing baseline only — confirmed `line-bindings.test.ts`/`line-candidates.test.ts`'s type collision already exists on clean `main`, unrelated to this work); `npm test` 121/121 suites, 616/616 tests; `npm run build` succeeds.
- Remaining work: apply `supabase/migrations/0007_archive_list.sql` to the live Supabase project (cannot be done from this session); manual QA of the archive flow end-to-end once deployed.
- Blockers: none for merge; production functionality blocked on the migration being applied.
- Risks / notes:
  - **Design correction made mid-implementation:** `archivePlace`'s duplicate-key handling. The spec assumed a simple "duplicate → no-op," but the `(trip_id, place_id)` unique index doesn't distinguish by `list`, so archiving an *existing* LINE candidate would silently do nothing under a pure no-op. Fixed to flip the existing row's `list` to `'archived'` on conflict instead — verified with dedicated tests.
  - **Scope deviation from spec:** did not extend `TripCandidate`/`lib/candidates.ts` as the spec assumed. Checked first — `TripCandidate`/`lib/candidates.ts` are LINE-ingest-only (server-side, no UI consumer); the actual UI (`CandidatePanel`, `app/actions/candidates.ts`) already uses the simpler `Candidate` type. Extended that instead, since it's what's actually rendered.
  - **Dead code, not deleted:** `components/DayCandidateSuggestions.tsx` + `lib/utils/candidateArrange.ts` (+ their still-passing standalone tests) are now unused — the per-day geographic candidate suggestions they provided are superseded by the trip-wide LINE 討論 tab. Left in place for reversibility; Manager can decide to remove.
  - **Real behavior change:** the LINE 討論 tab shows the same trip-wide candidate list in every day (not geographically filtered per day like the old widget was) — deliberate, matches DEC-503's trip-wide scope, but worth a product sanity check since it's a UX change from what existed before.
  - `CandidatePanel` gained a new `加入本天` action (`data-testid="cand-add-{id}"`, reusing the old widget's testid pattern) — needed to preserve "add an existing LINE candidate into a specific day," which the old per-day widget did and the new trip-wide tab otherwise wouldn't.
  - Concurrent session collision noted, not encountered as an active lock: `claude_lane_a` is now on `task-012-place-drawer` (TASK-012 redefined as an external Google Maps link per an earlier commit on `main`) — no file overlap hit during this session's work, but TASK-012 and TASK-022 are both on the `## Conflicts` list for card surfaces; worth checking before either's PR merges.
- Manager decisions needed: apply migration 0007; decide whether to delete the now-dead `DayCandidateSuggestions`/`candidateArrange` code or leave it; sanity-check the "same list in every day's LINE tab" behavior change.
- Suggested next task: review/merge PR #14; apply the migration; then manual QA (archive from all 3 surfaces, add-back-to-day, permanent delete, empty states, map/panel layout).
- Suggested commit message: see PR #14 body (`https://github.com/WillyLin8505/superpower_trip_map/pull/14`).

### TASK-012 - Open place in Google Maps (new tab)

- Status: done
- Review Status: not_reviewed
- Completed: Added `buildPlaceMapsUrl(place)` to `lib/utils/mapUrl.ts` — an official `api=1` Maps Search URL, `query_place_id` when a Google Place ID is available, falling back to name then address. Wired a "🗺️ 在 Google Maps 開啟" link (`target="_blank" rel="noopener noreferrer"`) into `ItineraryCard`, `RecommendationCard`, and `CandidatePanel`, alongside their existing archive/delete button rows. Pure external link, no in-app drawer, no layout change — matches the 2026-07-12 scope redefinition (original "right-side drawer" spec was never written and would have overlapped TASK-022's side panel).
- Modified files: `lib/utils/mapUrl.ts`, `components/ItineraryCard.tsx`, `components/RecommendationCard.tsx`, `components/CandidatePanel.tsx`, `__tests__/map-url.test.ts`, new `__tests__/itinerary-card-maps-link.test.tsx`, new `__tests__/recommendation-card-maps-link.test.tsx`, `__tests__/candidate-panel.test.tsx`, plus 14 pre-existing test files that fully `jest.mock('@/lib/utils/mapUrl', ...)`.
- Tests: TDD — RED confirmed for 4 new test files/cases before implementation, GREEN after (`npx jest map-url itinerary-card-maps-link recommendation-card-maps-link candidate-panel --verbose` → 18/18). `npm test` (full suite) — 123/123 suites, 626/626 tests, no regressions. `npx tsc --noEmit` — no new errors. `npm run build` — succeeds.
- Remaining work: none for TASK-012 itself. `CardContent.tsx`/`TimelineCard.tsx` intentionally not touched — no existing action-button row there, consistent with TASK-022's archive button also skipping it.
- Blockers: none.
- Risks / notes: **Regression caught and fixed during verification, not a silent gap** — the first full-suite run after implementing surfaced 13 failing suites / 35 failing tests, all `TypeError: buildPlaceMapsUrl is not a function`. Root cause: 14 existing test files fully mock `@/lib/utils/mapUrl` (only providing `buildDayEmbedUrl`), and `ItineraryCard` now calls the new export unconditionally. Fixed by adding `buildPlaceMapsUrl: jest.fn(() => '...')` to each of the 14 mocks; re-ran full suite to confirm 123/123 green before committing. Built in worktree `claude_lane_a`, branch `task-012-google-maps-link`, off `origin/main` post-TASK-022-merge (`334ace6`). Pushed and opened **PR #15**: https://github.com/WillyLin8505/superpower_trip_map/pull/15. Not yet merged.
- Manager decisions needed: review/merge PR #15.
- Suggested next task: none currently queued in this spec area — check `$multi-status` for the next `todo` task.
- Suggested commit message: already committed as `6e0ef9a`, see PR #15 body.
