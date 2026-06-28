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

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-27-combined-input.md
Branch: main

## Tasks
- [x] Task 1: CombinedInput — search mode + mode badge
- [x] Task 2: Article + URL extraction pipelines
- [x] Task 3: Wire CombinedInput into ItineraryClient

Task 1: complete (commits 48a2d5d..2a99b70, review clean after fix — controller stripped deploy-breaking win32 binding devDependency + duplicate jest.setup.js; fixed result-card badge to use searchQuery, detectMode trims before length check)
  Minors deferred to final review: Enter-to-submit constraint conflicts with multi-line textarea (paste needs newline); COUNTRIES duplicated from ItineraryPasteInput (brief-mandated); unused mockExtract/mockScrape in test (consumed by Task 2)
Task 2: complete (commits 2a99b70..476b9cf, review clean — two article/url tests appended verbatim, 6/6 pass, test-only)
Task 3: complete (commits 476b9cf..9ee913f, review clean — import+usage swap only, both old component files retained, home page untouched, build clean 118/118)
Fix (post-final-review): complete (commit 8b9bb33 — preserve query on failed search [setText gated on found, jsdom workaround intact]; added confirm-country branch test)

## Final Review
- Whole-branch review (48a2d5d..8b9bb33): Ready to merge — no Critical/Important
- Controller caught+removed deploy-breaking infra (win32-x64 binding as hard devDependency would EBADPLATFORM on Vercel/Linux; duplicate jest.setup.js) before Task 1 review
- Applied Minor #1 (failed-search query preservation) + added confirm-country test
- Follow-ups noted (non-blocking): Enter-to-submit intentionally omitted (multi-line textarea needs newline for paste); COUNTRIES/inferType/TYPE_LABEL/verify-pipeline duplicated from ItineraryPasteInput+PlaceSearchBar — extract to lib/ once home-page input is also migrated
- 119 tests pass, 20 suites; build clean
- Final commit: 8b9bb33

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-28-accommodation-type-tag.md
Branch: main (Lane A)

## Tasks
- [x] Task 1: 共用 placeType 模組 + 擴充 PlaceType + 收斂重複定義
- [x] Task 2: TypePicker 元件
- [x] Task 3: 卡片底色 + TypePicker + 串接 onChangeType
- [x] Task 4: 首頁清單四選一 + DWELL 預設停留

Task 1: complete (commits 0518650..bc9a25c, review clean — Approved; fix bc9a25c wired search-preview badge color to TYPE_META + updated schedule comment)
  Minors (none outstanding): both review minors fixed in bc9a25c
Task 2: complete (commits bc9a25c..0702255, review clean — Approved, 3/3 tests)
  Minors for final review: (a) inert `size` prop — both ternary branches identical, no consumer passes size → consider removing (YAGNI, plan-mandated); (b) overlay outside-click dismiss untested; (c) no aria-expanded/aria-haspopup on trigger
Task 3: complete (commits 0702255..7a111ae, review clean — Approved, 130/130 + build green; handleChangeType faithfully mirrors handleToggleLock, no recalc/duration change)
  Minor for final review: itinerary-card-type test named "without changing duration" has no duration assertion (invariant lives in handleChangeType; card is stateless re duration) — rename or add explicit assertion
Task 4: complete (commits 7a111ae..2d6ae48, review clean — Approved, no issues, 131/131 + build green)
Final fixes: complete (commit 6fb3316 — client-level handleChangeType invariant test [no recalc/no duration change], removed inert TypePicker size prop, added aria-haspopup/aria-expanded, renamed misleading card test)
Cleanup: removed stray agent worktree; dropped accidentally-committed final-fix-report.md from 6fb3316; gitignored .claude/worktrees/ (commit 1f93bc5)

## Final Review
- Whole-branch review (0518650..2d6ae48): Ready to merge with minor fixes — no Critical/Important except the untested client-level invariant (now fixed in 6fb3316)
- Centralization verified DRY (no duplicate inferType/TYPE_LABEL/TYPE_STYLE/DWELL anywhere); no-reschedule invariant sound by construction (recalcDay never reads place.type)
- Out-of-scope noted (non-blocking, pre-existing): RecommendCard/ai.ts render type as binary attraction?景點:餐廳 — recommend.ts narrows recs to restaurant|attraction so accommodation never reaches it
- 133 tests pass, 25 suites; build clean
- Final commit: 1f93bc5

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-28-crowd-data-layer.md
Branch: lane/ai-research (Lane B); BASE: 84e271c

## Tasks
Task 1: complete (84e271c..4aa08ff, review clean — Minor: boundary 40/70 untested, plan-mandated)
Task 2: complete (4aa08ff..b696979, review clean)
Task 3: implemented (b696979..171566e) — review pending. NOTE: merged main into lane to bring accommodation PlaceType (子專案#1 dep); resolved tsc TS2367/2352; crowd tests 13/13 green post-merge.
Task 3: complete (b696979..171566e, review clean — Minor: stale Partial<Place> cast in test (redundant post-merge); CURVES Record<string> vs Partial<Record<PlaceType>>; both defer to final triage)

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-28-split-time-lock.md
Branch: main (Lane A)

## Tasks
- [x] Task 1: 拆分鎖資料模型 + 卡片兩個鎖按鈕
- [x] Task 2: 每天標頭兩個整天全鎖按鈕

Task 1: complete (commits e5527e4..2b5455c, review clean — Approved; timeLocked→startLocked+durationLocked fully migrated across 17 files, 157/157 + build green, scheduler anchor a pure rename)
  Minor for final review: ItineraryClient.tsx:204 durationLocked:false indented 6 spaces instead of 8 (cosmetic, zero impact)
Task 2: complete (commits 2b5455c..1174a9d, review clean — Approved; per-day lock-all derived state airtight, no recalc, 161/161 + build green)
  Minor for final review: day-lock-all empty-day test only asserts 整天鎖開始 disabled, not 整天鎖停留 (impl correct; coverage gap)
Final fixes: complete (commit 3740fe1 — added ItineraryClient lock-toggle invariant test [recalcPlan not called + times unchanged past debounce], scheduler durationLocked-non-anchor case, day-lock-all duration-disabled assertion, fixed handleAddPlaces indentation)

## Final Review
- Whole-branch review (e5527e4..1174a9d): Ready to merge — no Critical/Important
- Anchor swap verified a pure rename; no-reschedule/no-time-mutation invariant correct by construction for all 4 handlers; zero timeLocked residue
- All 4 final-review minors fixed in 3740fe1
- 164 tests pass, 33 suites; build clean
- Final commit: 3740fe1

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-28-calendar-dates.md
Branch: main (Lane A)

## Tasks
- [x] Task 1: 日期工具 lib/utils/date.ts
- [x] Task 2: 資料模型欄位 + 建立端 + 首頁日期 picker
- [x] Task 3: 日期感知營業時間 + 排程
- [x] Task 4: 行程頁頂部起訖列 + 每天日期/時間窗
- [x] Task 5: 縮短行程警告 + 散到其他天/刪除

Task 1: complete (commits 8236433..0d74c09, review clean — Approved; date utils pure+local-midnight; fix 0d74c09 made daysBetween DST-safe via Date.UTC, 6/6)
Task 2: complete (commits 0d74c09..f3b0b8a, review clean — Approved; PlanResult.startDate + DayItinerary.dayStart/dayEnd, home date pickers, all fixtures migrated [+test-drag], hours untouched, 170/170 + build green)
  Minor for final review: app/page.tsx isoToday computed each render (matches spec; cosmetic — prefer lazy useState initializer)
Task 3: complete (commits f3b0b8a..78166b9, review clean — Approved; hours date-aware via weekdayIndex, CLOSED→outsideHours true (req 12), scheduler threads day date + dayStart, card dateIso/day startDate required + fixtures migrated, 173/173 + build green)
  Minors for final review: (a) closed-regex tests `rest` in getHoursForDate but full `entry` in getCloseMin/checkOutsideHours (no bug, inconsistent); (b) checkOutsideHours 24h-format OUTSIDE-window path untested (only 24h inside covered)
Task 4: complete (commits 78166b9..e36f737, review clean — Approved; top date-range bar, per-day date label + activity window editor, start-shift/extend/window handlers, targetDays scaffolded for Task 5, 176/176 + build green)
Task 5: complete (commits e36f737..3f46e7a, review clean — Approved; overCount warning, scatter-into-kept via findClosestDay + delete, renumber + recalcPlan + targetDays clear, eslint-disable removed, 179/179 + build green)
Final fixes: complete (commit 7cda32e — reset targetDays on extend [fixes stale-overflow after shorten→extend]; new start-date-recompute integration test [real recalcPlan: warning flips when start date lands on a closed weekday]; activity-window hours total（N.N 小時）+ dayEnd<dayStart clamp; server-cursor comment; 24h-format outside-hours test)

## Final Review
- Whole-branch review (8236433..3f46e7a): Ready to merge with fixes — no Critical
- recalcPlan threads each day's real date + dayStart through every branch (verified); req-12 closed-day fix correct+tested; no PlanResult/DayItinerary literal left missing fields
- 1 Important (stale targetDays on extend) + 1 Important (missing start-date recompute test) fixed in 7cda32e; 24h-outside test + window hours/clamp added
- Accepted deviations (non-blocking): 共 N 天 shows actual container count M with banner explaining surplus (clearer); end-date input reflects M during unresolved shorten
- 181 tests pass, 38 suites; build clean
- Final commit: 7cda32e

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-28-timeline-view-laneB.md
Branch: lane/ai-research (Lane B timeline); BASE: 102b63d

## Tasks
Task 1: complete (102b63d..12612bd, review clean — rulerTicks corrected to exclude on-the-hour start [code/test consistency]; Minor: toMin no NaN guard, non-on-hour tick untested → final triage)
