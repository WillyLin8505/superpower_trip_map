# Design: Google Maps Embed Routing + Info Card Updates

**Date:** 2026-06-26
**Status:** Approved

## Goal

Replace the custom straight-line map with per-day Google Maps Embed showing real road routing, and update each itinerary card to show today's opening hours and a description instead of a ticket price.

---

## Feature 1 — Per-Day Google Maps Embed

### Problem

`MapView` currently draws straight-line polylines between places using raw lat/lng coordinates. This looks inaccurate and gives users no real routing information.

### Solution

Remove the single shared `MapView`. Each day's itinerary section embeds its own Google Maps Directions iframe, which shows the actual road route for that day's stops. No Directions API calls are needed — the Embed API is free.

### Embed URL Format

```
https://www.google.com/maps/embed/v1/directions
  ?key=NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  &origin={lat1},{lng1}
  &destination={latN},{lngN}
  &waypoints={lat2},{lng2}|{lat3},{lng3}
  &mode=driving|walking|transit
```

- `origin` = first place in the day
- `destination` = last place in the day
- `waypoints` = all middle places, pipe-separated
- `mode` = mapped from `TransportMode` (`driving`/`walking`/`transit`)

### Files Changed

**`components/MapView.tsx`** — deleted entirely.

**`lib/utils/mapUrl.ts`** — new file. Exports `buildDayEmbedUrl(places: ScheduledPlace[], mode: TransportMode): string`. Returns empty string if fewer than 2 places.

**`components/ItineraryDay.tsx`** — renders a `<iframe>` below the place cards using `buildDayEmbedUrl`. Hidden if the URL is empty (0 or 1 places). Height: `400px`, full width.

**`app/actions/directions.ts`** — `getDirectionsPolyline` deleted (no longer used). `buildDistanceMatrix` kept (still used for route optimization and `travelMinToNext`).

**`app/itinerary/ItineraryInner.tsx`** — remove `<MapView>` import and usage. Layout becomes single-column (each `ItineraryDay` is full-width, its embed is directly below its cards).

### Notes

- Requires **Maps Embed API** enabled in Google Cloud Console (same project as existing key).
- `travelMinToNext` values are unaffected — still computed from Distance Matrix.
- If a day has only 1 place, no embed is shown.
- Transport mode is passed down from `PlanResult.transportMode` to each day's embed URL.

---

## Feature 2 — Info Card: Opening Hours + Description, No Ticket Price

### Problem

- `ticketPrice` field in `Place` is misnamed — it stores `editorial_summary.overview` (a Google editorial description), not a ticket price. The card displays it as "票價：" which is wrong.
- Cards show no opening/closing time for each place.
- `aiDescription` is shown as a fallback but the preference order (Google editorial vs AI) is unspecified.

### Solution

Rename the field to `description`, add today's opening hours to each card, and show `description || aiDescription` without a label. Remove the "票價：" display entirely.

### Files Changed

**`lib/types.ts`** — rename `ticketPrice?: string | null` → `description?: string | null` in the `Place` interface.

**`app/actions/places.ts`** — update `getPlaceDetails` to populate `description` from `r.editorial_summary?.overview ?? null` (field rename only, no API change).

**`lib/utils/hours.ts`** — new file. Exports:
```typescript
export function getTodayHours(openingHours: string[] | null): string | null
```
- `openingHours` is Google's `weekday_text` array: index 0 = Monday, index 6 = Sunday.
- Today's index: `(new Date().getDay() + 6) % 7`
- Strips the leading day name (e.g. `"Monday: "`) and returns the time range string (e.g. `"9:00 AM – 5:00 PM"`).
- Returns `null` if `openingHours` is null or today's entry is missing.
- If the entry contains "Closed" (case-insensitive), returns `"休息"`.

**`components/ItineraryCard.tsx`** — three changes:
1. Replace `place.ticketPrice` with `place.description` (field rename).
2. Add opening hours line: call `getTodayHours(place.openingHours)` — if non-null, render `今日 {hours}` in `text-sm text-gray-500`. Placed between the time editor row and the rating row.
3. Description line: render `place.description || place.aiDescription` without any label, in `text-sm text-gray-600 italic`. Hidden if both are null.

### Updated Card Display Order

```
[●] 景點名稱  [景點]  [⚠ 請確認營業時間]
開始 09:00 · 停留 90 分鐘
今日 9:00 AM – 5:00 PM
評分：4.3 ★
這是景點的說明文字。
→ 前往下一站約 12 分鐘
```

---

## Architecture Summary

```
lib/types.ts                      ← rename ticketPrice → description
lib/utils/mapUrl.ts               ← new: buildDayEmbedUrl()
lib/utils/hours.ts                ← new: getTodayHours()
app/actions/places.ts             ← field rename in getPlaceDetails
app/actions/directions.ts         ← delete getDirectionsPolyline
app/itinerary/ItineraryInner.tsx  ← remove MapView, single-column layout
components/MapView.tsx            ← deleted
components/ItineraryDay.tsx       ← add per-day iframe embed
components/ItineraryCard.tsx      ← opening hours + description, no ticketPrice
```

No new environment variables. No new npm dependencies. Maps Embed API must be enabled in Google Cloud Console.

---

## Testing

| Area | Test |
|------|------|
| `buildDayEmbedUrl` | Unit: 1 place → empty string; 2 places → valid URL with origin+destination; 3+ places → waypoints present; mode mapped correctly |
| `getTodayHours` | Unit: null input → null; today's day extracted correctly; "Closed" entry → "休息"; missing entry → null |
| `ItineraryCard` | Render: shows hours when present, hides when null; shows description/aiDescription with fallback; no "票價" text rendered |
| `ItineraryDay` | Render: iframe present when 2+ places; iframe absent for 1 place |
