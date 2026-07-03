# Recommendation Backfill Design

Date: 2026-07-02
Branch: lane/ai-research
Status: Approved (brainstorming)
Builds on: `2026-06-30-per-day-recommendations-design.md` (still in PR #1)

## Goal

When the user presses a recommendation card's arrow to add it to a day, remove
that card and **slide one replacement into its slot** so the category stays at 5.
The replacement comes from a leftover website reserve first, then Google Places
on demand. If neither yields a new place, the slot simply stays empty.

## Decisions (from brainstorming)

1. **Count stays 5 per category.** The "3" in the original request referred to
   the backfill behavior, not the count. Each category (點心/景點/餐廳) still
   shows up to 5.
2. **Lazy, one-at-a-time.** A backfill happens only when a slot opens (an add),
   and fetches/promotes exactly one card — no large pre-fetch.
3. **Backfill source order:** (a) leftover **website** recommendations that were
   fetched & enriched but didn't make the top 5; then (b) **Google Places** on
   demand when the reserve is empty.
4. **Exhaustion is acceptable.** If the reserve is empty and Google returns
   nothing new, the slot stays empty (category shows 4). No retry loop.
5. **Trip-wide no-duplicate guarantee is preserved** for backfills.

## Data Model

`getDayRecommendations` currently returns each category as `DayRecommendation[]`
(≤5). Each category now carries a shown list and a reserve:

```ts
export interface CategoryList {
  shown: DayRecommendation[]     // up to 5 — displayed
  reserve: DayRecommendation[]   // leftover website picks, already enriched (may be empty)
}

export interface CategoryBuckets {
  dessert: CategoryList
  attraction: CategoryList
  restaurant: CategoryList
}

export type RecommendationsByDay = CategoryBuckets[]  // index 0 = day 1
```

`DayRecommendation` is unchanged (`Place` + `reason` + `sourceLabel`).

**Why the reserve is free:** `getDayRecommendations` already enriches *all*
website extractions (via `searchPlace`/`getPlaceDetails`) before `capBuckets`
slices to 5. Today the extras are discarded. The reserve keeps them. Google
fills are **never** placed in the reserve — they are fetched on demand only.

### How `shown`/`reserve` are computed (server)

Per day, per category, from the assigned website extractions `W` (already
deduped and enriched) and the Google fill step:
- If `|W| >= 5`: `shown = W[0..5]`, `reserve = W[5..]`.
- If `|W| < 5`: `shown = W ++ googleFill(5 - |W|)`, `reserve = []`.

So `reserve` = website extractions beyond the 5 shown; it is empty whenever the
category needed Google fills to reach 5.

## Backfill Flow

### Client — `handleAddRecommendation(dayIdx, rec)` (extends existing)

1. Wrap `rec` as a `ScheduledPlace`, append to `days[dayIdx]`, `scheduleRecalc`
   *(existing behavior)*.
2. Remove `rec` from `shown[cat]` for that day.
3. **Backfill the opened slot:**
   - If `reserve[cat]` is non-empty → shift its first item into `shown[cat]`
     (synchronous, no network).
   - Else → mark that day+category as backfilling (drives a placeholder), call
     `fetchReplacementRecommendation(day, cat, excludeIds)`, and on resolve
     append the result to `shown[cat]` if non-null; clear the backfilling mark.
4. Record the backfilled `placeId` in the client's trip-wide "already
   recommended" set (a ref) so it can't be chosen again elsewhere.

`excludeIds` (built client-side, freshest state) =
- every `placeId` currently in the itinerary (all days), plus
- every `placeId` in any category's `shown` and `reserve` across all days, plus
- everything already added this session.

### Server — new action

```ts
// app/actions/recommend.ts
fetchReplacementRecommendation(
  day: DayItinerary,
  category: 'dessert' | 'attraction' | 'restaurant',
  excludeIds: string[]
): Promise<DayRecommendation | null>
```

Reuses the existing fill logic:
1. `centroid = centroidOf(day.places)`; if null → return `null`.
2. `candidates = await nearbySearch(centroid.lat, centroid.lng, category)`.
3. First candidate whose `placeId` is not in `excludeIds` →
   `getPlaceDetails(placeId)` to enrich (fall back to the lightweight candidate
   if details fail) → return as `DayRecommendation` with
   `sourceLabel: 'Google 推薦'`, `reason: 'Google 高評分推薦'`, `type: category`.
4. No usable candidate → return `null`.

Wrapped so a `nearbySearch`/`getPlaceDetails` throw yields `null`, never a
rejected promise that would surface to the user.

### Component — `DayRecommendations`

- Reads `recommendations[cat].shown` (instead of `recommendations[cat]`).
- Renders a lightweight placeholder card in a slot that is mid-backfill (driven
  by a `backfilling` flag passed from `ItineraryClient`).
- Remains presentational; all reserve/backfill state lives in `ItineraryClient`.

## Edge Cases

- **Reserve empty + Google returns nothing new** → slot stays empty; category
  shows 4. No retry loop.
- **Backfill fetch fails** (network/API) → treated as `null` (per-call
  try/catch); slot stays empty; no crash.
- **Rapid successive adds in one category** → reserve shifts are synchronous and
  safe; concurrent Google fetches each build `excludeIds` from the latest state,
  and if a returned card's `placeId` is already in shown/reserve/itinerary (a
  race), it is dropped so no duplicate appears (slot stays empty that round).
- **Empty day (no centroid)** → reserve-only backfill; no Google fetch; empty
  slot if the reserve is dry.
- **Added place never recurs** → it is now an itinerary place, and `excludeIds`
  includes itinerary placeIds.

## Testing

- **`getDayRecommendations` (new shape)**
  - Category with >5 website extractions → `shown` length 5, `reserve` = the rest.
  - Category with <5 website extractions + Google fill → `shown` length 5,
    `reserve` empty (Google fills are never reserved).
  - Existing trip-wide dedup / geographic-assignment tests updated for the new
    shape.
- **`fetchReplacementRecommendation`**
  - Returns the first non-excluded enriched nearby candidate.
  - Returns `null` when every candidate is excluded or `nearbySearch` is empty.
  - Returns `null` (not a throw) when the day has no centroid.
  - Mocks `nearbySearch` / `getPlaceDetails`.
- **`DayRecommendations`**
  - Renders `.shown`; shows a placeholder for a slot flagged mid-backfill.
- **`ItineraryClient` (integration)**
  - Add with non-empty reserve → next reserve item appears, count stays 5, place
    lands in the day.
  - Add with empty reserve → `fetchReplacementRecommendation` called with
    `excludeIds`; returned card appears.
  - Server returns `null` → count drops to 4, no crash.
  - Backfilled `placeId` does not duplicate an existing recommendation/itinerary
    place.

## Scope / Out of Scope

**In scope:** the `shown`/`reserve` shape change to `getDayRecommendations`, the
new `fetchReplacementRecommendation` action, the client backfill logic, the
`DayRecommendations` read/placeholder change, and updated tests.

**Out of scope (YAGNI):**
- Changing the visible count away from 5.
- Pre-fetching a large Google reserve.
- Infinite retry when both sources are exhausted.
- Backfilling a *different* category than the one added.
- Persisting reserve/backfill state across reloads.
