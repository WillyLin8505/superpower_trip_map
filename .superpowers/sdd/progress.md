# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-25-itinerary-planner.md
Branch: main (new project)

## Tasks
- [x] Task 1: Project Setup + Shared Types
- [x] Task 2: Haversine Distance + Distance Matrix API
- [x] Task 3: 2-opt TSP Optimiser
- [x] Task 4: Day Scheduler
- [x] Task 5: Google Places Server Action
- [x] Task 6: Input Page UI
- [x] Task 7: Itinerary Orchestrator + Basic Display
- [x] Task 8: Google Maps Component
- [x] Task 9: Editable Itinerary (Drag-and-Drop + Time Editor)
- [x] Task 10: Claude CLI Integration (AI Summaries)
- [x] Task 11: Website Scraping + Recommendation Pipeline + UI
- [x] Task 12: Admin Panel (Reference URL Management)
Task 1: complete (commits 1615355..3532e8c, review clean)
Task 2: complete (commits 3532e8c..a7e3b7a, review clean after fix)
Task 3: complete (commits a7e3b7a..078bb17, review clean)
Task 4: complete (commits 078bb17..a33f2a9, review clean)
Task 5: complete (commits a33f2a9..795c1bb, review clean)
Task 6: complete (commits 795c1bb..a41c3c9, review clean after fix)
Task 7: complete (commits a41c3c9..cb17c0c, review clean after 2 fixes)
Task 8: complete (commits cb17c0c..89bf11a, review clean)
Task 9: complete (commits 89bf11a..7d6c50e, review clean after 2 fixes)
Task 10: complete (commits 7d6c50e..ff171b9, review clean after fixes)
Task 11: complete (commits ff171b9..04ba053, review clean after 3 fixes)
Task 12: complete (commits 04ba053..4f174f1, review clean)

## Final Review
- Whole-branch review: 3 important issues found and fixed (commit fbcb107)
- Minor issues noted (not blocking): photo URL server key latency, URL length for 25 places, no server-side floor for empty places, recommendation auto-trigger is manual button instead of auto-parallel
- Final commit: fbcb107

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-26-itinerary-split-layout.md
Branch: main

## Tasks
- [x] Task 1: Move iframe to right-side sticky column in ItineraryDay

Task 1: complete (commits 55ed392..f46b974, review clean)

## Final Review
- Whole-branch review: Ready to merge (no Critical/Important blocking issues)
- Follow-up noted: add structural layout test (`iframe.closest('[class*="sticky"]')`) to pin split-column layout in CI
- Final commit: f46b974

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-26-cross-day-drag.md
Branch: main

## Tasks
- [x] Task 1: findContainer + applyDragResult utilities
- [x] Task 2: Wire up single DndContext + useDroppable per day

Task 1: complete (commits be7ac08..2b1c69c, review clean — minor: null as null verbosity)
Task 2: complete (commits 2b1c69c..1f43aba, review clean)
Fix: complete (commit 8dde719 — NaN guard in findContainer, isOver highlight)

## Final Review
- Whole-branch review: Ready to merge
- Minor noted: null as null cast noise, no same-day no-op test, isOver mock always false in embed tests (all non-blocking)
- Final commit: 8dde719

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-26-google-maps-embed-and-card-info.md
Branch: main

## Tasks
- [x] Task 1: Data layer — rename ticketPrice→description, add utility functions
- [x] Task 2: Update ItineraryCard — opening hours + description display
- [x] Task 3: Per-day Google Maps Embed + layout cleanup

Task 1: complete (commits 92c262c..b67f4f2, review clean)
Task 2: complete (commits b67f4f2..906912c, review clean)
Task 3: complete (commits 906912c..1810306, review clean)

## Final Review
- All 63 tests pass; 15 test suites clean
- MapView.tsx deleted; getDirectionsPolyline removed; ticketPrice→description rename complete
- Final commit: 1810306

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-26-batch-itinerary-paste.md
Branch: main (merged from feat/batch-paste)

## Tasks
- [x] Task 1: extractItinerary server action
- [x] Task 2: Update searchPlace to accept country name
- [x] Task 3: ItineraryPasteInput component
- [x] Task 4: Wire into app/page.tsx

Task 1: complete (prior to b2a4ff0, review clean)
Task 2: complete (commits ..b2a4ff0, review clean)
Task 3: complete (commits b2a4ff0..90fdcf6, review clean)
Task 4: complete (commits 90fdcf6..dcb3cdd, review clean)
Fix: complete (commit 4241672 — error recovery, type validation, dedup, stale country reset)

## Final Review
- Merged via af891c3 (Merge branch 'feat/batch-paste')
- All 63 tests pass across both plans
- Final commit: f558bdd (cross-day drag fixes on top)


---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-26-dessert-lock-late-exit.md
Branch: main

## Tasks
- [x] Task 1: Data layer — types + checkLateExit + construction sites
- [x] Task 2: Scheduler + paste input + RecommendPanel
- [x] Task 3: Card UI — dessert badge, lock toggle, lateExit warning
- [x] Task 4: Client lock logic + scheduleRecalc with lateExit

Task 1: complete (commits 422aff9..73cfb44, review clean — minor: getCloseMin duplicates day-index logic, inconsistent closed-check target)
Task 2: complete (commits 73cfb44..6282e81, review clean)
Task 3: complete (commits 6282e81..e5df74a, review clean after fix — type=button on lock button)
Task 4: complete (commits e5df74a..9c4dc2e, review clean after fix — extracted checkOutsideHours to lib/utils/hours.ts, restored comments)

## Final Review
- Whole-branch review: Ready to merge (no Critical/Important)
- Minors noted (non-blocking): DWELL typed as Record<string,number> not Record<PlaceType,number>; spec says handleToggleLock calls scheduleRecalc but code correctly does NOT; 8 checkLateExit tests vs spec's 7 (extra is valid); outsideHours/lateExit warning DOM placement inconsistent
- Final commit: 9c4dc2e
Task 1: complete (commits 5b23c95..f00b514, review clean)
Task 2: complete (commits f00b514..d4f4d7a, review clean)
Task 3: complete (commits d4f4d7a..2d97a5f, review clean after fix — locked card DAY_START check added)
Task 4: complete (commits 2d97a5f..1d27aec, review clean after fix — MINUTES restored to start with '00', data-testid scoping added)
Task 5: complete (commits 1d27aec..54ad909, review clean — includes controller hotfix for scrollIntoView guard)
Task 6: complete (commits 54ad909..38166d1, review clean after fix — mb-6 spacing corrected)
Task 6: complete (commits 54ad909..38166d1, review clean after fix — mb-6 spacing)

## Final Review
- Whole-branch review (5b23c95..4f018b6): 3 Important issues found and fixed
  - PlaceSearchBar type inference (keyword-based, no AI call)
  - Multi-lock overflow: between-segment places exceeding next lock's start get outsideHours:true
  - Midnight-wrap: end-time picker duration now uses rawDur+1440 for negative values
- Minor noted (non-blocking): haversineSeconds semantic comment, findClosestDay empty-days edge, non-5-min TimeScrollPicker state visual
- 112 tests pass, 19 suites clean
- Final commit: 4f018b6
