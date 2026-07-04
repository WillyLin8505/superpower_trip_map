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
Task 2: complete (12612bd..85d5220 [initial 95ab6b8 + dateIso revise 85d5220], review clean — Minor: end-time picker rawDur==0→1440, copied verbatim from existing ItineraryCard, defer)
Task 3: complete (85d5220..9907feb + fix 18895fd, review APPROVED after moving PointerEvent polyfill out of shared jest.setup.ts into the test file; Minor: nativeEvent.clientY fallback redundant, defer)
Task 4: complete (18895fd..e5207f5 + fix 82a82ab, review APPROVED after onChangeType pass-through parity fix + test collision fix; Minor: empty-state placeholder is TimelineDay-only [spec §8], accepted)
All 4 tasks complete. Proceeding to final whole-branch review.

## Final whole-branch review
- Verdict: MERGE WITH MINOR FOLLOW-UPS (opus). No blocking; parity faithful; Lane A can swap ItineraryDay<->TimelineDay with no prop changes.
- Fix-now applied (commit 2aa7846): CardContent hours label 今日->營業 to match current ItineraryCard (keeps Lane A adoption a clean no-op).
- Deferred Minors: toMin NaN guard; end-picker rawDur==0→1440 (verbatim from ItineraryCard); nativeEvent.clientY redundant; cardHeight math duplication (justified by live preview); empty-state placeholder (spec §8, intentional).

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-30-per-day-recommendations.md
Branch: lane/ai-research; BASE: c14984e

## Tasks
Task 1: complete (c14984e..1f91a18, review clean — Spec ✅. ⚠️ resolved: Place.address is `string` so `?? ''` correct; places.ts:1 is 'use server'. Minors → final triage: no try/catch around fetch (consistent w/ existing searchPlace/getPlaceDetails), dessert keyword URL not asserted, null-photoUrl path not asserted)
Task 2: complete (1f91a18..8daacf5 [impl e458208 + fix 8daacf5], review clean after fix — Critical empty-days guard added to assignToDays + test; Important dedupe stable-order test strengthened; Minor capBuckets all-3-categories test. 6/6 pass)
Task 3: complete (8daacf5..2f7accc, review clean — Spec ✅, quality Approved. Impl cleaned brief's 2 no-op test lines (top-level mock aliases). ⚠️ resolved: capBuckets preserves order (slice), REC_CATEGORIES order confirmed Task 2. Minors → final triage: no try/catch around nearbySearch/getPlaceDetails in fill loop (client mount .catch degrades gracefully); per-category `have` rebuild wasteful but correct. 2/2 file + 206 suite pass)
Task 4: complete (2f7accc..62d27bc, review clean — Spec ✅, Approved. Minor → final triage: Test 1 doesn't assert opening-hours/reason render (guarded correctly in impl). 2/2 pass)
Task 5: complete (62d27bc..b7cc20b, review clean — Spec ✅, Approved, no findings. 3/3 pass)
Task 6: complete (b7cc20b..7906a0c, review clean — Spec ✅, Approved. Both day components symmetric; iframe attrs preserved; border/rounding migrated to inner box. Minor → final triage: itinerary-day-recommend.test.tsx may lack trailing newline (final lint will catch). new + 6 regression pass)
Task 7: complete (7906a0c..5345bbd, review clean — Spec ✅, Approved. Mount effect run-once+leak-safe; handleAddRecommendation carries all 9 Place fields + removes card across all categories; 5 existing ItineraryClient tests each +4/-4 mock-swap only (zero assertion changes); getRecommendations/RecommendPanel/RecommendCard fully removed, no dangling refs. Minor → final triage: itinerary-client-recommend test mock boilerplate (necessary). full suite 209 pass, lint clean.)

All 7 tasks complete. Proceeding to final whole-branch review.

## Final whole-branch review
- Verdict: MERGE WITH FOLLOW-UPS (opus). E2E flow verified correct; no crashes, no key leaks; geographic assignment + website-first ordering sound.
- Fix-now applied (commit ecb5af8, re-reviewed clean): (1) IMPORTANT cross-day dedup — trip-wide recommendedIds set so no placeId repeats across days/categories + new test; (2) per-day fill try/catch preserves partial results; (3) removed dead Recommendation interface. Full suite 210 pass, lint clean.
- Deferred follow-ups (non-blocking): parallelize the serial fill loop (perf/quota); type nearbySearch `(r: any)` at places.ts:84 (warning-level, pre-existing); RecommendationCard test omits hours/reason assertions; itinerary-day-recommend test trailing newline. TimelineDay has recommendations parity wired but is not rendered in production yet (only ItineraryDay is).
- Final commit: ecb5af8

## Post-PR CI fix (Vercel build failure)
- PR #1 Vercel deploy failed. Root cause reproduced locally via `next build` (which npm test / npm run lint did NOT surface):
  1) app/actions/places.ts `(r: any)` → @typescript-eslint/no-explicit-any is a BUILD error under `next build`. Fixed with a NearbyPlaceResult interface.
  2) app/actions/recommend.ts fill-loop `have` set spread `...existingIds`/`...recommendedIds` → Set spread needs downlevelIteration under project tsconfig target. Fixed with Array.from().
- Both were masked because ts-jest compiles looser than `next build`. Lesson: run `next build` in verification, not just `npm test`.
- Fix commit 97dc9a7 (pushed). Local: `next build` clean, 210 tests pass.
---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-28-accommodation-scheduling.md
Branch: main (Lane A); BASE: 4f2eac4

## Tasks
- [x] Task 1: 抽出純 TSP 工具 lib/tsp.ts
- [x] Task 2: 住宿分群 lib/accommodation/cluster.ts
- [x] Task 3: 接上 schedule.ts cluster 路徑 + nightIndex
- [x] Task 4: 衍生提醒（沒住宿天 / 停留低於建議）+ 夜次徽章

Task 1: complete (commits 4f2eac4..edcf78b, review clean — Spec ✅ + Approved, 198/198 + build green)
  Minor (plan-mandated, non-blocking): nearestNeighbor adds `if (best<0) break` guard absent in old optimize.ts inline code — matches brief's reference verbatim; zero behavioral diff for fully-connected matrices (only real input). Defensive improvement.
Task 2: complete (commits edcf78b..7f04c7a, review clean — Spec ✅ verbatim match + Approved, 204/204 + build green)
  Minor (non-blocking): clusterAttractionsToDays N=0 (zero days) would throw — plan-mandated, unreachable (cluster path only runs with ≥1 hotel & days≥1); report misreported test line count (cosmetic).
Task 3: complete (commits 7f04c7a..9d03fb8, review clean — Spec ✅ + Approved, 207/207 + build green; schedule.ts split into mealOrder()+fillDay(), cluster branch on hotels.length>0)
  PLAN-MANDATED behavioral change (accepted, surface to user + final review): chunk path (no-accommodation) day with 3+ restaurants — new fillDay snaps 18:00 to the 2nd restaurant ENCOUNTERED (a pm-block "extra"), not the designated dinner (last). 0/1/2-restaurant days identical to before. Brief explicitly prescribed "1st/2nd restaurant encountered" rule. No test covers 3+ case. Cluster path unaffected (uses routeDay not mealOrder).
  Minor (pre-existing carry-forward): fillDay placeIds.indexOf(place.placeId) == loop index by construction; harmless, future cleanup.
Task 4: complete (commits 9d03fb8..6cf63a0, review clean — Spec ✅ + Approved, 212/212 + build green; ItineraryDay missing-lodging warning + isLastDay prop, ItineraryClient wiring, ItineraryCard below-DWELL warning + 第N晚 badge; all derived, no fixture migration)

## Final Review
- Whole-branch review (4f2eac4..6cf63a0): Ready to merge except 1 Important — FIXED
- Cross-task integration verified: cluster path (tsp→cluster→schedule) ends each non-last hotel day at its hotel card, 1-indexed nightIndex survives fillDay spread, proximity clustering + one-day overflow correct, fixed-endpoint 2-opt keeps thisHotel last & strips prevHotel. No-accommodation chunk path behavior-preserved (0/1/2-restaurant meal snaps identical).
- Important FIXED (commit 77cdb8a): assignHotelsToDays silently dropped hotels when accommodations > days (collide on last slot, vanish from itinerary — regression vs old path). Fix surfaces overflow hotels on the last day; +1 covering test (3 hotels/2 days → all 3 render). 213/213 + build green.
- Accepted plan-mandated (NOT a defect): chunk-path day with 3+ restaurants snaps 18:00 to 2nd-encountered restaurant not designated dinner. Surface to user.
- Minors (non-blocking, logged above): nearestNeighbor best<0 guard; clusterAttractionsToDays N=0 unreachable; fillDay placeIds.indexOf==idx; {nightIndex&&} guard style.
- Final commit: 77cdb8a

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-30-smart-arrange.md
Branch: main (Lane A); BASE: 7dbc16a

## Tasks
- [x] Task 1: 資料模型 + arrangeDay.ts 純核心（成本模型 + 決定性 2-opt，重用 recalcDay）
- [x] Task 2: fetchDayArrangeInputs 伺服器動作
- [x] Task 3: ItineraryDay 控制項（兩 checkbox + 智慧排程按鈕）
- [x] Task 4: ItineraryClient 串接（handler + loading + 錯誤）

Task 1: complete (commits 7dbc16a..03f744f, review clean — Spec ✅ verbatim + Approved, 220/220 + build green; recalcDay export verified body-unchanged, deterministic 2-opt, locked-fixed, zero-migration optional fields)
  Minor (non-blocking): code comment says "2-opt" but it's a continuous-greedy no-break scan variant (still deterministic + terminating); brief prose said 8 tests, actually 7 (all pass).
Task 2: complete (commits 03f744f..bd726bf, review clean — Spec ✅ verbatim + Approved no issues, 222/222 + build green; thin server action, needCrowd gates crowd fetch)
Task 3: complete (commits bd726bf..794b5fd, review clean — Spec ✅ + Approved no issues, 228/228 + build green; ItineraryDay checkboxes+button, verbatim 繁中 copy, additive/gated, disabled logic correct)
Task 4: complete (commits 794b5fd..789f5b7, review clean — Spec ✅ + Approved, 231/231 + build green; handleSmartArrange reads fresh planRef post-await [no stale closure], handleSetAvoid no-recalc, error role=alert, 3 integration tests run REAL arrangeDayOrder/ItineraryDay)
  Reviewer ⚠️ all resolved: day-0/card-id testids exist (verified); weekday mapping correct (Mon-first → Sat 2026-07-04 = idx 5; [B,A,C] only reachable w/ crowd applied → test proves physics).

## Final Review
- Whole-branch review (7dbc16a..789f5b7): Ready to merge — no Critical/Important/Minor blocking
- Verified end-to-end: units consistent (matrix secs + crowd penalty secs, additive); weekdayIndex(Mon-first)↔levelAt(Mon-first) match; recalcDay body unchanged (only `export`) → existing scheduling preserved; reuse-recalcDay achieves spec's single-timing-source intent (approved deviation from simulateTimes); deterministic (strict-improvement, no rand/Date); locked anchors fixed + travelMinToNext refreshed to new adjacency; optional fields zero-migration; no any/no new deps; 繁中 copy.
- Non-blocking observations (no action): server action gets full ScheduledPlace[] (extra fields serialized, harmless); O(n²·n) recalc per candidate (fine for day sizes); crowd penalty also scores locked anchors (harmless/arguably correct).
- 231 tests green, build clean
- Final commit: 789f5b7

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-06-30-per-segment-transport.md
Branch: main (Lane A); BASE: 4ab711d

## Tasks
- [x] Task 1: 純基礎 haversineMeters + pickLegDefault + 型別
- [x] Task 2: 伺服器動作 computeLegPlan + legDuration
- [x] Task 3: legMerge 純函式（保留手動）
- [x] Task 4: applyLegDefaults 後置步驟 + 接上 plan.ts
- [x] Task 5: ItineraryCard 每段工具+時間+下拉
- [x] Task 6: ItineraryClient 串接 + ItineraryDay 透傳

Task 1: complete (commits 4ab711d..666e35e, review clean — Spec ✅ + Approved, 243/243 + build green; haversineMeters extract [haversineSeconds byte-identical], pickLegDefault rule, optional leg types zero-migration)
Task 2: complete (commits 666e35e..fd75907, review clean — Spec ✅ + Approved, 242/242 + build green; computeLegPlan arg order verified (dist,driving,transit,walking), legDuration single leg)
  Minor (non-blocking, final-review cleanup): unused `SECS` const in legs-actions.test.ts (dead — mock re-inlines literals).
Task 3: complete (commits fd75907..d492029, review clean — Spec ✅ + Approved no issues, 246/246 + build green; legMerge preserve-manual-on-unchanged-adjacency, pure spreads)
Task 4: complete (commits d492029..6c3df9a, review clean — Spec ✅ + Approved, 248/248 + build green; applyLegDefaults post-step assigns per-leg modes + recalcDay re-times w/ per-segment travel, plan.ts passes withLegs, schedule.ts untouched)
  Minor (cosmetic): apply-leg-defaults test has no describe wrapper.
Task 5: complete (commits 6c3df9a..9c3b01f, review clean — Spec ✅ char-for-char + Approved, 252/252 + build green; per-segment row icon+label+min+dropdown+計算中…, no existing test disturbed)
  Minor (plan-mandated, non-blocking): LEG_META allocated inside component per-render (could be module-level).
Task 6: complete (commits 9c3b01f..7c0f2f7 + fix a124118, review clean after fix — Spec ✅ + Approved, 254/254 + build green; scheduleRecalc structural flag [2s leg recompute via computeLegPlan+legMerge], handleChangeLegMode fresh-planRef no-stale-closure, all structural call sites wired [drag/add/delete/scatter/smart-arrange/onAddPlaces], time/lock stay non-structural, ItineraryDay passthrough)
  NOTE: first attempt (session-limit interrupted, uncommitted) reverted clean; re-dispatched fresh.
  Important FIXED (commit a124118): structural branch never cleared legError → banner persisted through later successful recalcs; added setLegError(null) at try entry. 254/254 green.
  Minor (accepted): async 2s debounce callback can setState after unmount (benign React 18; window now ~2s+RTT). LEG_META per-render (Task 5).
  Final-review ⚠️ to check: ItineraryCard aria-label/labels exist (Task 5 ✓); no standalone handleDeletePlace with non-structural scheduleRecalc.

## Final Review (#4)
- Whole-branch review (4ab711d..a124118): Ready to merge — no Critical/Important/Minor
- Verified: units consistent (matrix secs/threshold meters), haversineSeconds byte-identical, every structural mutation flags leg recompute, no single-place-delete handler skips it, applyLegDefaults-not-schedule.ts deviation sound, aria-label renders
- 254/254 green + build clean; pushed 14c35a5..dfb58dd
- NOTE: range also contains 2 non-#4 commits (Lane C auth+persistence docs: 9a54e0c design, 8b5d56c plan) committed to main during the cross-day gap — docs-only, no dependency change; not mine, left as-is

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-07-01-free-time-blocks.md
Branch: main (Lane A); BASE: eaee19b

## Tasks
- [x] Task 1: 純函式 freeTime.ts（freeBlocks + formatGap）
- [x] Task 2: ItineraryDay 穿插空閒 pill

Task 1: complete (commits eaee19b..f8a3838, review clean — Spec ✅ + Approved no issues, 262/262 + build green; freeBlocks card-gap+day-end ≥15, formatGap 分/小時, pure)
  NOTE: implementer subagent interrupted (session limit) after transcribing both files but before commit; controller verified content matches brief exactly + ran free-time/full-suite/build green, then committed. 8 it() blocks (brief Step 4 label "7" was a typo).
Task 2: complete (commits f8a3838..b2ab21d, review clean — Spec ✅ + Approved, 265/265 + build green; ItineraryDay Fragment-wrapped card + conditional 空閒 pill; CRITICAL regression check PASS — all 10 card props intact, key moved to Fragment; pill is non-sortable sibling, no drag interference)
  Minor (non-blocking): ⏱ as HTML entity vs literal (plan-mandated style match).

## Final Review (#6)
- Whole-branch review (eaee19b..b2ab21d): Ready to merge — no Critical/Important
- Verified: idle math subtracts travel (genuine idle only), 15-min threshold both card-gap+day-end, all edge cases hold (overflow/single/empty/accommodation-last), drag SortableContext unaffected (pills non-sortable siblings, items by id list), map layout untouched, all 10 card props intact + key on Fragment, derived-only zero-migration, only ItineraryDay+freeTime touched (Lane C low-conflict honored)
- Product nit (non-blocking, spec-conformant, user's call): day-end pill also shows after an accommodation last-card — could read oddly; possible follow-up to suppress
- 265/265 green + build clean
- Final commit: b2ab21d

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-07-02-ai-rearrange.md
Branch: main (Lane A); BASE: 55b241f

## Tasks
- [x] Task 1: 純變動引擎 rearrangeChanges.ts（diffPlan + applyChanges）
- [x] Task 2: 伺服器動作 rearrangeItinerary
- [x] Task 3: 元件 AiRearrangeInput
- [x] Task 4: 接上 ItineraryClient（最小改動）

Task 1: complete (commits 55b241f..81f0b09, review clean — Spec ✅ verbatim + Approved no issues, 273/273 + build green; Change union move/duration/window, diffPlan, applyChanges subset-safe + no input mutation [places spread-cloned])
Task 2: complete (commits 81f0b09..694b4df, review clean — Spec ✅ + Approved no issues, 278/278 + build green; rearrangeItinerary ref-prompt + callClaude + buildProposed ALL validation guards verified [ref 1..N perm, day count, HH:MM, dur>0, durationLocked kept], all failure paths → ok:false)
Task 3: complete (commits 694b4df..d05d87b, review clean — Spec ✅ verbatim + Approved, 281/281 + build green; AiRearrangeInput input+loading+per-day change list+✗(immutable Set)+一鍵同意全部+取消+error, changeLabel per kind)
  Minor (non-blocking): apply-all button stays clickable when all changes ✗'d → applyChanges(plan,[]) harmless no-op.
Task 4: complete (commits d05d87b..e8b4d85 + cleanup 51d52e9, review clean after cleanup — Spec ✅ + Approved, 282/282 + build green; ItineraryClient +6 lines [import + handleAiApply→scheduleRecalc(_,true) + render AiRearrangeInput])
  INFRA: ItineraryClient now transitively imports Anthropic SDK (AiRearrangeInput→rearrange→lib/claude→new Anthropic()) → crashed jsdom suites w/ TextEncoder undefined. Fix: jest.config.ts moduleNameMapper stubs @anthropic-ai/sdk → __stubs__/anthropic-sdk.js (test-only; production uses real SDK; claude.test.ts has own precedence mock; does NOT shadow real component — Task 3 coverage intact).
  Minor FIXED (controller cleanup 51d52e9): removed dead __stubs__/AiRearrangeInput.tsx (unused after final approach used the SDK stub).
  ⚠️ for final review: whole suite now depends on @anthropic-ai/sdk stub to load any ItineraryClient-rendering suite (documented in jest.config.ts comment).

## Final Review (#8)
- Whole-branch review (55b241f..51d52e9): Ready to merge — no Critical/Important
- Core safety airtight: AI can NEVER drop/dupe/invent a place (ref 1..N perm enforced by buildProposed; applyChanges only permutes existing place objects; day count + place set invariant). buildProposed maps AI days positionally (ignores AI's day field → can't corrupt numbering). durationLocked triple-enforced (buildProposed keeps + diffPlan skips + applyChanges refuses).
- Subset-apply correct, no interdependence bug (clone-first, 3 independent passes duration→window→move; a place with both duration+move survives both). diff↔apply consistent (apply consumes by kind not id).
- ItineraryClient +6 lines; handleAiApply reuses #4 scheduleRecalc(_,true) → moved places re-timed + per-segment travel recomputed. No regression.
- jest-config SDK stub: test-only (build uses real SDK), anchored ^@anthropic-ai/sdk$ (no shadowing), claude.test.ts own precedence mock keeps callClaude tested.
- Minor (non-blocking, optional follow-up): isHHMM /^\d{2}:\d{2}$/ accepts "99:99"; durationMin only checked >0 (no upper bound). Both preview-gated + non-crashing.
- 282/282 green + build clean
- Final commit: 51d52e9

=== ROADMAP COMPLETE: all 9 Lane A sub-projects shipped (#1-#9). ===

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-07-02-recommendation-backfill.md
Branch: lane/ai-research; BASE: 8ba73c9

## Tasks
Task 1: complete (8ba73c9..9740a35, review clean — Spec ✅, Approved. reserve=website-only verified, Google fills→shown, cross-day dedup preserved (recommendedIds seeded from all extractions incl reserve). No any/Set-spread. day-recommend 8/8, action 12/12. Minors→triage: stale "cap" comment in recommend.ts loop header; action dedup test scans .shown only (reserve dedup structurally guaranteed). NOTE: next build type-checking deferred — component reads old shape until Task 3/4.)
Task 2: complete (9740a35..3236bd7, review clean — Spec ✅, Approved, no findings. fetchReplacementRecommendation: null-on-no-centroid without calling nearbySearch, exclude filter, enrich+fallback, try/catch→null. 4/4 pass.)
Task 3: complete (3236bd7..fc15e4d [impl 8e58446 + fix fc15e4d], review clean after fix — Spec ✅. DayRecommendations reads .shown, backfill placeholder; ItineraryDay/TimelineDay forward backfilling. Important fixed: guard was `total===0 return null` before placeholder check → now `total===0 && !anyBackfilling` so placeholder shows when all-empty+backfilling (+ test). Minor deferred: day-component backfilling prop uses literal union not derived type (structurally equal). 5/5 pass.)
Task 4: complete (fc15e4d..09a66dc, review clean — Spec ✅, Approved. handleAddRecommendation: immutable reserve-promote / Google-fetch with recsRef sync, buildExcludeIds from freshest planRef+recsRef, race/dup guard, finally clears backfillKey; no crash on null/reject; added place excluded from future backfills; backfillKeys copy-on-write. focused 3/3, full suite 290/290, npm run build CLEAN. Minors→triage: backfilling object literal new per render (negligible); no concurrency test.)

All 4 tasks complete. Proceeding to final whole-branch review.

## Final whole-branch review (backfill)
- Verdict: MERGE WITH FOLLOW-UPS (opus). No Critical/blocking. E2E sound: commitRecs is single writer keeping recsRef+recsByDay in lockstep; planRef updated before buildExcludeIds; trip-wide dedup holds for initial fill AND on-demand backfill; reserve website-only; placeholder never wedges (finally clears key); Google key server-side.
- Fix-now applied (commit pending): stale "cap" comment in recommend.ts:67 corrected.
- Deferred follow-ups: (Minor) dedup test scans .shown only; day-comp backfilling literal-union type; backfilling object literal per render; setState-after-unmount in backfill resolver (harmless in React 18); backfillKeys boolean not count (cosmetic); TimelineDay backfilling prop is dead wiring (parity only). 
- TRACKED FOLLOW-UP (Important, pre-existing — NOT this feature): handleDeleteDay/handleScatterDay renumber plan.days but do NOT reindex recsRef/recsByDay; a backfill fetch resolving after a delete can commit under a shifted day (existence guard checks presence not identity). Broader per-day-recs architectural gap; fix separately.
- Suite 290/290, npm run build clean.

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-07-03-accommodation-card-refinements.md
Branch: main (Lane A follow-up); BASE: 4c2e3fe

## Tasks
- [x] Task 1: (A) recalcDay 住宿延到 dayEnd
- [x] Task 2: (B) 早 check-in 提醒（ItineraryCard）

EXECUTED INLINE (controller, context-limited): both changes are tiny verbatim-from-plan edits.
- (A) clientScheduler.ts: extendLastAccommodation helper applied at both recalcDay returns (last accommodation, !durationLocked, arrival<dayEnd → durationMin=dayEnd−arrival). Removes trailing free-time pill (remaining→0). Respects lock + arrival≥dayEnd edge.
- (B) ItineraryCard.tsx: derived warning「⚠ 早於一般 check-in 時間（15:00）」when type=accommodation && startTime<15:00.
- 7/7 new tests (extend-accommodation 4, itinerary-card-checkin 3); full suite 316/316; build clean. No existing tests broke.

## Final Review (accommodation-card-refinements, 4c2e3fe..c2fac3e)
- Whole-branch review (opus, independent) — Verdict: **Ready to merge — no Critical/Important.**
- Verified: (A) extendLastAccommodation wraps BOTH recalcDay return paths but only one executes per call → no double-apply; per-day dayEnd keying correct (read inside recalcDay, recalcPlan .map); duration math dayEndMin−startMin → freeTime remaining=0 so trailing pill vanishes (freeTime.ts untouched); accommodation is last stop so no downstream re-time corruption; all guards present (empty/non-accom/durationLocked/startMin≥dayEndMin), immutable returns. (B) pure-derived, 15:00 threshold correct, no collision with lateExit/below-DWELL warnings. Constraints honored: strict TS, no any, no new pkgs, TC copy, only the 2 allowed source files touched. No existing accommodation/free-time/scheduler test went stale (reviewer checked free-time, itinerary-day-free-time, client-scheduler, accommodation-warnings, schedule-accommodation).
- Minors (non-blocking, logged): (1) lateExit computed pre-extension in applyWarnings, not refreshed after duration rewrite — LATENT ONLY (accommodations have openingHours:null → checkLateExit returns false); (2) lock-path wrap (clientScheduler.ts:105) untested — all 4 extend tests hit the no-lock branch → suggested fast-follow test; (3) helper also pins an over-long unlocked accommodation back to dayEnd (spec §2 貼回 dayEnd intended) — name reads extend-only, consider rename/comment; (4) 3rd private toMin (clientScheduler/freeTime/ItineraryCard) — DRY-forbidden by "only 2 files" constraint, plan-sanctioned, not a defect.
- Final commit: c2fac3e (already pushed to origin/main). Lane A remains ROADMAP COMPLETE.

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-07-03-laneC-c2-sharing-membership.md (+ C1 auth-persistence)
Branch: lane/c1-auth-persistence (C1+C2) → merged to main

## Ship to main (merge 8936653)
- Merged Lane C spine (C1 auth+persistence + C2 sharing+members) into main via --no-ff.
- Base had diverged: main +43 / lane +28 commits. Single content conflict: app/itinerary/ItineraryClient.tsx.
- Conflict resolved additively — kept Lane A (AiRearrangeInput import + recs mount effect + commitRecs) AND Lane C (trips actions import + onSave/autosave/onRetry save UI). Shared state decls auto-merged.
- Post-merge dep install: main worktree lacked @supabase/ssr / @supabase/supabase-js (were in merged package.json); npm install fixed 9 suite load failures.
- Merge test fixes: (1) itinerary-client-ai-rearrange.test.tsx (Lane-A-only, missed Lane C's auto-merged mock updates) — added next/navigation + trips mocks now that ItineraryClient uses useRouter/saveTrip; (2) itinerary-client-save.test.tsx — removed stale @/components/RecommendPanel mock (component no longer exists on main).
- Gate on merged tree: 373 tests pass (83 suites), next lint clean, next build passes (all Lane C + Lane A routes).
- Pushed origin/main c2fac3e..8936653 (deploy triggered). Roadmap C1/C2 → SHIPPED.
- Outstanding: live Supabase/OAuth (Google + LINE) verification pending prod keys.
- Not cleaned up (intentional): lane/c1-auth-persistence, lane/c2-sharing, lane/c3-candidate-pool branches + sibling worktrees retained — C3 builds on C1/C2.

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-07-04-laneC-c3-candidate-pool.md
Branch: lane/c3-candidate-pool (stacked on lane/c1-auth-persistence = C1+C2); BASE: 48f1c90 (merged main for current integration base)
Mode: subagent-driven, code-first (live Supabase verify deferred)

## Tasks
- [x] Task 1: candidate pool migration (0003)
- [x] Task 2: Candidate type + candidates actions
- [x] Task 3: CandidatePanel component
- [x] Task 4: ItineraryClient integration (state + promote + panel)
- [x] Task 5: wire /itinerary/[tripId] page
- [x] Task 6: roadmap + full gate

Task 1: complete (commit 4c42230, migration 0003_candidates.sql — code-first, no unit test)
Task 2: complete — Candidate type + add/list/remove actions (RLS, admin name-resolve, 0-row guard). Test authored by Codex (gpt-5.5), Claude reviewed+ran: 10/10.
Task 3: complete — CandidatePanel (reuse CombinedInput, list, remove, day-picker promote); 5/5.
Task 4: complete — ItineraryClient candidate pool (state, add/remove, promote-to-day move, panel persistent-only); 4/4. Fixed test bug (two CombinedInput mocks → scoped pool click); corrected plan's stale assertion (promoted name also renders as a card → assert pool-only adder text gone).
Task 5: complete — trip page listCandidates → initialCandidates; +mock listCandidates in pre-existing trip-page/-members tests (new page data dep).
Task 6: complete — roadmap C3 → DONE; full gate 401/401 jest (89 suites), lint clean, next build PASS.

## Notes
- Merged main into laneC3 first for current integration base (single content conflict: progress.md ledger union). Reconciled plan literals against merged code: ScheduledPlace fields + CombinedInput onAdd/onAddPlaces props all matched; promote handler byte-identical to current handleAddPlace.
- Two-model workflow: Task 2 test authored by Codex (gpt-5.5, 30.9k OpenAI tokens), reviewed+run by Claude. Tasks 3-5 tests written by Claude directly — Codex background delegation proved flaky across session-resume (runs exited 0 but produced no file); loop already proven on Task 2. Final independent Codex review of whole C3 diff pending.
- Outstanding: live Supabase apply 0003_candidates.sql + multi-account RLS verification (pending keys).

## Final independent Codex review (gpt-5.5, whole C3 diff) — 3 findings, verified by Claude
- **Medium ×2 FIXED (RLS)**: delete policy was adder/owner-only → (a) a removed former member could still delete their own candidates (no participation check); (b) UI shows 移除/放進 for ALL candidates but non-adder delete silently failed → promote-move left duplicates. Both fixed by changing delete RLS to `participant_delete_candidates … using is_trip_participant(trip_id)` (shared-pool intent per spec「成員…移除」; participant check also closes the former-member gap). SQL-only, no unit test; jest/lint/build unaffected.
  - DEVIATION from plan's「移除限 adder/owner」: intentional — plan was internally inconsistent (restricted RLS but rendered 移除 for everyone); spec + UI want any participant to curate the shared pool.
- **High ACCEPTED as known limitation (not fixed)**: promote-to-day is non-transactional — plan update relies on debounced autosave while `removeCandidate` deletes immediately; if autosave fails AND the user refreshes without retrying, the promoted place is lost while the candidate is already gone. Recoverable in-session (saveState='error' + retry; place stays in local state). Inherent to the spec's client-move design under last-write-wins; a transactional promote RPC (update plan + delete candidate atomically) is C4/C5-scope. FOLLOW-UP logged.

---

# SDD Progress Ledger
Plan: docs/superpowers/plans/2026-07-04-itinerary-warm-journal-restyle.md
Branch: main (Lane A); BASE: 4ed40b3
Mode: subagent-driven. Pure-visual restyle (溫暖旅誌 → itinerary page). Controller does gstack visual spot-checks; implementers run jest + next build.

## Tasks
- [x] Task 1: 設計 token 打底（fonts + tailwind theme + globals）
- [x] Task 2: 類別色 + ItineraryCard（+ 3 測試斷言）
- [x] Task 3: ItineraryDay 襯線標題 + 控制列收色
- [ ] Task 4: 共用元件 token 化 + 按鈕語言
- [ ] Task 5（可延後）: 自動排程卡片進場動效

Task 1: complete (27641d6, review=controller-verified — exact-spec transcription; jest 401/401, next build clean, grep bg-background=0, browse body #FBF7F0 + Noto Sans TC). NOTE: first implementer died on session limit post-edit pre-commit; controller confirmed files==plan then gated+committed.
Task 2: complete (6ff62a7..79a8b6a, review clean — ✅ Approved: exact class mappings, accent token cascades color-only, 3 assertions test real behavior, no blue residue, 401/401 + build green). Minor(final-review): 2 stale test NAMES still say 'purple/pink'. NOTE: live-server /itinerary visual deferred to end-of-plan clean pass (dev-server port/cold-compile flakiness; jsdom RTL asserts the new classes so component output is verified).
Task 3: complete (776fb69..e9c7e47, review clean — ✅ Approved, no issues; 13 lines className-only, serif day header, zero blue/gray/orange residue, 401/401 + build green). ⚠→controller visual: 散到其他天→warn-family, 整天鎖 hover→bg-paper (both token-valid, folded into end-of-plan visual pass).
