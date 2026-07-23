# QA Report: fec9bbb2 Recommendation And Photo Loop

## Target

- Private URL requested: `https://superpower-trip-map.vercel.app/itinerary/fec9bbb2-3fd5-4db7-af03-d6ce0bd8860a`
- Public share URL tested: `https://superpower-trip-map.vercel.app/share/5d7ec31d-5a31-4407-aa0a-a40195fc3f4f`
- Date: 2026-07-23

## Findings

- The private itinerary URL returns `404` in headless QA because this session is not logged in.
- The trip exists in Supabase and has `share_token = 5d7ec31d-5a31-4407-aa0a-a40195fc3f4f` with `link_access = edit`.
- Live share-page QA rendered all 6 day side panels.
- All 18 recommendation category tabs showed 5 items.
- The browser still attempted 26 `/api/photo` requests from old stored Google photo proxy URLs.
- Recommendation photos were not consistently 5 photos per card when `/api/photo` was blocked; 25 visible recommendation cards had fewer than 5 rendered thumbnails.
- Recent `api_usage_events` showed repeated paid `google_maps / nearby_search / nearby_search_pro` events for this trip.

## Root Cause

- The previous fix disabled Google photo media at the `/api/photo` server route, but old saved trip data and new Google recommendation candidates could still contain `/api/photo?ref=...` URLs.
- Recommendation results were not persisted back into the trip plan, so reloads recomputed recommendations and could call paid Google Nearby Search again.
- There was no persistent app diagnostic event for "recommendations under 5" or "photos under 5"; only paid/free API usage was logged.

## Fix Applied

- Itinerary cards now defer old Google photo proxy URLs and try free `/api/place-photos` lookup first.
- Google-derived place/search results no longer store `/api/photo` URLs when Google photo media is disabled.
- `PlanResult` now supports a saved recommendation cache with a cache key based on day places and recommendation centers.
- `ItineraryClient` uses a complete saved recommendation cache on reload instead of calling `getDayRecommendations` again.
- `getDayRecommendations` now records zero-cost `app_diagnostics` events:
  - `recommendation_health_ok`
  - `recommendation_underfill`
- `/api/place-photos` now records zero-cost `app_diagnostics / place_photo_underfill` when free photo lookup returns fewer than requested.

## Evidence

- Live blocked-photo screenshot: `.gstack/qa-reports/screenshots/2026-07-23-fec9bbb2-share-live-block-photo.png`
- Live blocked-photo metrics: `.gstack/qa-reports/screenshots/2026-07-23-fec9bbb2-share-live-block-photo.json`
- Private URL screenshot: `.gstack/qa-reports/screenshots/2026-07-23-fec9bbb2-live.png`
- Private URL metrics: `.gstack/qa-reports/screenshots/2026-07-23-fec9bbb2-live.json`

## Validation

- `npm test -- --runTestsByPath __tests__/itinerary-client-recommend.test.tsx __tests__/photo-strip.test.tsx __tests__/photo-route.test.ts __tests__/google-maps-cost.regression-1.test.ts __tests__/api-usage-events.test.ts`
- `npm run build`

## Remaining Constraint

- If Google photo media stays disabled, exact 5-photo coverage cannot be guaranteed for every card. Free image sources can return 0-4 relevant images for obscure places. The app now records those underfills instead of silently looping.
