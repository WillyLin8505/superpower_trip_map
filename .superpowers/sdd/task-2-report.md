# Task 2 Report: 類別色 + ItineraryCard 套用

## Files changed
- `lib/placeType.ts` — added `accent: string` field to `TypeMeta`; rewrote `TYPE_META` for all 4 place types to use warm design tokens (`bg-*-tint text-*-ink` badges, `bg-surface` cardBg, `border-l-*` accent).
- `components/ItineraryCard.tsx` — class swaps exactly per brief:
  - outer wrapper: `border border-l-4 rounded-xl p-4 ${meta.cardBg} ${meta.accent} ${place.outsideHours ? 'border-warn' : 'border-border'}`
  - index badge: `bg-blue-600` → `bg-clay`
  - name: `text-gray-900` → `text-ink`
  - nightIndex: `text-purple-700` → `text-lodging-ink`
  - all 4 warning texts (outsideHours, lateExit, short-duration, early-checkin): `text-orange-600` → `text-warn`
  - start/end time spans: `text-sm text-gray-500` → `text-sm text-clay-deep tabular-nums`
  - arrow between times: `text-gray-400` → `text-muted`
  - opening-hours / rating rows: `text-gray-500` → `text-muted`
  - travel-to-next row: `text-gray-400` → `text-muted`
  - Left untouched (outside brief's exact line list): drag-handle `text-gray-300/500`, description `text-gray-600`, "計算中…" `text-gray-400`, select border `border-gray-200` — these were not named in the brief's exact-replacement list.
- `__tests__/itinerary-card-info.test.tsx` — line 94-95 assertion updated to `bg-dessert-tint` / `text-dessert-ink`.
- `__tests__/itinerary-card-type.test.tsx` — line 39 assertion updated to `border-l-lodging`.

## TDD evidence

**Before (Step 2, expected FAIL):**
```
FAIL __tests__/itinerary-card-type.test.tsx
  ● renders accommodation card with purple background
    Expected substring: "border-l-lodging"
    Received string:    "border rounded-xl p-4 bg-purple-50 border-gray-200"

FAIL __tests__/itinerary-card-info.test.tsx
  ● shows 甜點 badge with pink style for dessert type
    Expected substring: "bg-dessert-tint"
    Received string:    "text-xs px-2 py-0.5 rounded-full font-medium bg-pink-100 text-pink-700"

Test Suites: 2 failed, 2 total
Tests:       2 failed, 11 passed, 13 total
```

**After (Step 5, PASS):**
```
Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
```

## Full suite result
```
npx jest --silent
Test Suites: 89 passed, 89 total
Tests:       401 passed, 401 total
```
No other test asserted an old category color class — the TYPE_META cascade to CardContent/RecommendationCard/TimelineCard passed with no changes needed there.

## Build result
```
npm run build
✓ Compiled successfully
✓ Generating static pages (13/13)
```
Success, no type errors, no lint failures.

## Concerns
None. All 4 target files modified exactly as specified; no other files touched; no new packages; no behavior changes (color-only).

## Commit
`79a8b6a` — "style(design): warm category tints + ItineraryCard (clay badge, category left-border, clay times)"
