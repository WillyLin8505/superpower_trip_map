# Decisions Log

Last updated: 2026-07-07
Manager-owned: yes.

## Workflow Decisions

### DEC-001 — Manager-owned Project State

Project State is owned by the Manager Session. Worker Sessions may report progress and propose changes, but should not directly update `planning/CURRENT_STATE.md` or global state/decision docs unless explicitly acting as Manager.

### DEC-002 — Role-free Session Model

Sessions are not fixed as Backend/Frontend/Testing. Any Session can take any suitable task from the task pool, provided it can avoid file conflicts and follow task dependencies.

### DEC-003 — Claim Before Work

Before production work, a Worker Session must read `planning/CURRENT_STATE.md`, `planning/TASKS.md`, and `planning/PARALLEL_WORK_PLAN.md`; then claim one `todo` task by setting it `in_progress` only if it does not conflict with existing `in_progress` tasks.

### DEC-004 — Handoff Instead of State Mutation

A Worker Session's default end product is a handoff summary with modified files, tests, unresolved issues, and Manager decisions needed. Manager integrates the handoff into Project State.

### DEC-005 — Planning Docs Are Coordination Surface

`planning/TASKS.md`, `planning/PARALLEL_WORK_PLAN.md`, `planning/SESSION_ASSIGNMENT.md`, and `planning/HANDOFF.md` define task coordination. They do not replace Superpowers docs; they sit above them as multi-session orchestration docs.

## Product Decisions from Brainstorming

### DEC-101 — Card Time Display

For non-lodging cards, show time as `開始時間 → 停留時間 → 結束時間`. Duration is a first-class editable field between the arrows and displays as `1 小時 30 分`, not raw `90 分`.

### DEC-102 — Duration Picker

Duration opens a scroll/wheel picker. Range is 15 minutes to 8 hours, in 15-minute increments. Times use 24-hour format; no AM/PM.

### DEC-103 — Lock Rule

At most two time facets can be manually locked because `start + duration = end`. If two are locked, the third is derived. Attempting to lock a third should be blocked with concise warning copy.

### DEC-104 — Duration Warning

Duration recommendation warning appears under the duration field. Show it only when the absolute difference from suggested duration is greater than 15 minutes. Copy format: `⚠ 建議 1 小時 30 分`.

### DEC-105 — Lodging Time UI

Accommodation cards use `入住 → 退房`, do not show normal duration editing or duration recommendation. Underlying implementation may reuse start/end lock fields but UI copy is lodging-specific.

### DEC-201 — Place Localization Order

Place display language priority is Traditional Chinese → English → original. Secondary/original text is shown only if it differs from the primary display name.

### DEC-202 — AI Translation Scope

AI translation may be used for attractions when Google has no Traditional Chinese name. Do not force-translate restaurants, dessert shops, or store names.

### DEC-203 — Localization Applies Everywhere

Localization applies to search results, AI-added places, recommendation cards, and itinerary cards. Addresses follow the same Traditional Chinese → English → original fallback.

### DEC-301 — Daily Recommendations Always Visible

Every itinerary day should always show a recommendation section, including loading, empty, and error states.

### DEC-302 — Recommendation Counts

Each day has three categories: dessert, attraction, restaurant. Each category shows 5 recommendations.

### DEC-303 — Recommendation Center

Each day can persist a recommendation center selected with Google Autocomplete. The center affects recommendations only, not smart scheduling or route maps.

### DEC-304 — Recommendation Center Fallback

Recommendation center resolution order: manual center → same-day itinerary centroid → previous day center/centroid, walking backward → trip centroid → ask user to input a center.

### DEC-305 — Recommendation De-duplication and Refresh

Recommendations de-duplicate across days and against existing itinerary places. Each category has a `換一批` action that replaces the current 5 cards for that day/category.
