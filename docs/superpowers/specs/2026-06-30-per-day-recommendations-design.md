# Per-Day Recommendations Design

Date: 2026-06-30
Branch: lane/ai-research
Status: Approved (brainstorming)

## Goal

After an itinerary is planned, show **per-day recommendations** under each day's
map. Each day gets its own recommendations, grouped into three switchable tabs
(點心 / 景點 / 餐廳), 5 cards per tab. Each card shows the same rich info as an
itinerary card (opening hours, rating, description, photo). An **arrow button**
on each card adds that recommendation directly into **that day's** itinerary;
once added, the card disappears from the list.

This **replaces** the existing trip-wide `RecommendPanel` (bottom-of-page,
checkbox-batch, adds to last day).

## Decisions (from brainstorming)

1. **Per-day assignment = geographic.** Each recommendation is assigned to the
   day whose existing places are geographically closest. A recommendation
   appears under exactly one day.
2. **Replace, not augment.** The bottom trip-wide `RecommendPanel` is removed;
   all recommendations move into per-day strips.
3. **Sources = existing arbitrary-URL mechanism.** No special trip.com
   integration. trip.com is just one URL an admin may add in `/admin`. The
   existing best-effort HTML scraper handles it.
4. **Source strategy = website-first, Google Places fills the gap.** Scraped
   sources are primary; when a day/category has fewer than 5, fill with Google
   Places nearby high-rated places of that type.
5. **Add interaction = single arrow, card disappears.** Clicking the arrow adds
   the place to that day, recalculates the schedule, and removes the card.
6. **Layout.** The recommendation strip lives in each day's right column, below
   the Google Map. The arrow points left (from recommendation → itinerary).
7. **Card richness.** Recommendation cards mirror `ItineraryCard` info: opening
   hours, rating, description, photo, type badge.
8. **Counts.** 3 categories (點心 / 景點 / 餐廳), up to 5 cards each per day.

## Layout

```
┌─ Day N ─────────────────────────────┬──────────────────┐
│  🍜 ItineraryCard 1                  │   Google Map      │
│  🏯 ItineraryCard 2                  │   (iframe)        │
│  🍰 ItineraryCard 3                  │                  │
│                                      ├──────────────────┤
│            ◀── adds to this day      │  推薦給第 N 天:    │
│                                      │  [點心][景點][餐廳]│
│                                      │  ◀ RecCard A      │
│                                      │  ◀ RecCard B      │
│                                      │  ◀ RecCard C ...  │
└──────────────────────────────────────┴──────────────────┘
```

## Data Model (`lib/types.ts`)

A recommendation is a `Place` plus a reason and a source label. `Place` already
carries `placeId`, `type`, `lat`/`lng`, `address`, `openingHours`, `rating`,
`photoUrl`, `description`. `PlaceType` already includes `dessert`.

```ts
export interface DayRecommendation extends Place {
  reason: string        // Claude's one-sentence rationale, or generic text for Places fills
  sourceLabel: string   // website label, or 'Google 推薦' for Places fills
}
```

The server action returns recommendations grouped by day and category:

```ts
// index 0 = day 1, etc.
export type RecommendationsByDay = Array<{
  dessert: DayRecommendation[]      // up to 5
  attraction: DayRecommendation[]   // up to 5
  restaurant: DayRecommendation[]   // up to 5
}>
```

## Backend Pipeline

Rewrite `app/actions/recommend.ts`. Replace `getRecommendations(currentPlaces)`
with `getDayRecommendations(days: DayItinerary[]): Promise<RecommendationsByDay>`.

Steps:

1. **Scrape** all sources in `config/sources.json` in parallel (existing
   `scrapeText`). Combine text (existing 20KB cap).
2. **Extract** with Claude: as many recommendations as the sources support
   across the three types (點心 / 景點 / 餐廳), each with a one-sentence reason.
   Target roughly `days × 3 categories × 5` but accept fewer — Google Places
   fill (step 5) makes up any shortfall. Extend the existing prompt to include
   `dessert` and to pass the trip's days/areas.
3. **Verify + enrich** each extracted recommendation via Google **Place
   Details** (`getPlaceDetails`) to populate opening hours, rating, photo,
   description, lat/lng, placeId. Drop ones Google cannot resolve.
4. **Assign to closest day** using each day's centroid (mean of its places'
   lat/lng) via the existing distance helper (`findClosestDay`/haversine).
   A recommendation belongs to exactly one day.
5. **Fill gaps** per day × per category: when a category has fewer than 5,
   call Google **Nearby Search** around that day's centroid for high-rated
   places of the mapped type, excluding places already in the itinerary or
   already recommended. Enrich via Place Details; label `Google 推薦`.
6. **Cap** each category at 5. Return `RecommendationsByDay`.

New helper in `app/actions/places.ts`:

```ts
nearbySearch(lat: number, lng: number, type: PlaceType, opts?): Promise<Place[]>
```

mapping `PlaceType` → Google query/type:
- `dessert`    → keyword 甜點/dessert (type `cafe`/`bakery`)
- `attraction` → type `tourist_attraction`
- `restaurant` → type `restaurant`

(Reuse `lib/placeType.ts` metadata where applicable.)

### Performance

For D days this can issue up to ~15·D Place Details calls plus nearby searches.
Run server-side, parallelized, and compute **once** when the itinerary is first
planned (not per render). Results are cached in client state.

## Frontend

### New components

- **`components/DayRecommendations.tsx`** — placed in each day's right column,
  below the map. Renders three tabs (點心 / 景點 / 餐廳) and the active tab's
  cards (≤5). Receives `dayIndex`, that day's category lists, and
  `onAdd(rec)`. Shared by both `ItineraryDay` and `TimelineDay`.
- **`components/RecommendationCard.tsx`** — mirrors `ItineraryCard`'s info
  layout (type badge, opening hours, rating, description, photo, source label)
  with a left-pointing arrow "add" button instead of drag handles. Calls
  `onAdd(rec)` when the arrow is pressed.

### Wiring (`ItineraryClient.tsx`)

- After the itinerary is planned, call `getDayRecommendations(days)` once and
  store `recommendationsByDay` in state.
- `handleAddRecommendation(dayIndex, rec)`:
  1. Wrap `rec` as a `ScheduledPlace` (default start, `DWELL[type]` duration,
     `aiDescription: rec.reason`).
  2. Append to `days[dayIndex].places`.
  3. Trigger `recalcPlan()`.
  4. Remove `rec` from `recommendationsByDay[dayIndex][rec.type]` so the card
     disappears.
- Remove the bottom `RecommendPanel` usage and its imports.

### Day views

`ItineraryDay.tsx` and `TimelineDay.tsx` each render `<DayRecommendations>` in
the right sticky column under the map, passing through that day's lists and an
`onAdd` bound to the day's index.

### Removed / retired

- `components/RecommendPanel.tsx` and its checkbox/batch flow (replaced).
- `components/RecommendCard.tsx` (replaced by `RecommendationCard.tsx`).

## Admin

`/admin` source management is unchanged. Sources remain in `config/sources.json`.

## Edge Cases

- **Day with no places** (no centroid): fall back to the trip centroid for
  assignment and nearby-search anchoring.
- **Already-in-itinerary places**: excluded from recommendations (by placeId).
- **Duplicate recommendations** across sources/fills: dedupe by placeId.
- **Unverified extractions** (Google can't resolve): dropped; never shown.
- **Adding shifts the schedule**: handled by existing `recalcPlan()`.
- **Empty `sources.json`**: pipeline still works via Google Places fill only.

## Testing

- **Unit**
  - Closest-day assignment picks the nearest day by centroid.
  - Category fill tops up to 5 and never exceeds 5.
  - Exclusion of already-in-itinerary and duplicate placeIds.
  - Day with no places falls back to trip centroid.
- **Component**
  - Tabs switch between 點心 / 景點 / 餐廳 and show the right cards.
  - Pressing a card's arrow calls `onAdd` with the right rec and removes the
    card from the list.
  - Card renders opening hours / rating / description when present.
- **Mocks**: Google Places (details + nearby) and Claude are mocked.

## Out of Scope (YAGNI)

- Special trip.com scraping / internal API.
- Per-day manual refresh of recommendations (compute once on plan; arrow-removed
  cards stay removed for the session).
- Persisting recommendations across reloads.
- AI-based (non-geographic) day assignment.
