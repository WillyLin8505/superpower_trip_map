# Place Photos Lightbox Design

Date: 2026-07-10
Status: approved-for-planning
Related task: TASK-011 - Implement four Google photos per place and lightbox

## Product Discovery

### User Problem

Itinerary and recommendation cards currently show text-first place information. When a traveler is comparing restaurants, desserts, attractions, or lodging, one photo is not enough to judge whether the place feels worth visiting. Users need a quick visual preview without leaving the itinerary editor or opening Google Maps.

### Narrowest Useful Wedge

Show up to four Google Place photos for each place on itinerary cards and recommendation cards. Tapping any photo opens an in-app lightbox where the user can view the larger image and move between the available photos.

### Target User

Trip planners building a multi-day itinerary who need quick visual confidence while choosing between recommended places or reviewing already scheduled places.

### Success Criteria

- Place and recommendation cards can render up to four photos when Google returns them.
- Existing single-photo data remains backward compatible.
- Clicking a thumbnail opens a lightbox without navigating away from the page.
- The lightbox supports next/previous navigation, close button, Escape key, and backdrop click.
- Cards without photos keep the current compact layout and do not show empty placeholders.
- Google photo references remain proxied through `/api/photo`; the browser never receives the Google API key.

## Non-Goals

- No photo upload or user-managed gallery.
- No image moderation, cropping editor, or captions.
- No new database migration; persisted plans keep using the same JSON shape, with additive optional fields only.
- No Google Maps drawer behavior; that is TASK-012.
- No redesign of card time/lock controls.

## Decisions

1. Additive data model: add `photoUrls?: string[]` to `Place`; keep `photoUrl: string | null` for compatibility.
2. Google photo references are converted to proxy URLs, not raw references, using `/api/photo?ref=...`.
3. Normalize to a maximum of four photos at the data boundary in `app/actions/places.ts`.
4. Render a thumbnail strip only when at least one URL exists.
5. The first thumbnail is visually dominant enough to read as the primary image, but all four images are available.
6. Lightbox state stays local to each card component; no global itinerary state is required.
7. Missing or broken images should not block itinerary editing. Use normal browser image fallback behavior and keep text visible.

## Data Model

### `Place`

Add an optional field:

```ts
photoUrls?: string[]
```

Compatibility rules:

- `photoUrl` remains the primary backward-compatible photo field.
- New code should derive display photos with `photoUrls` first, then fall back to `photoUrl`.
- Existing fixtures that only define `photoUrl` remain valid because `photoUrls` is optional.

### Photo URL Normalization

Create a small helper in `app/actions/places.ts` or a nearby utility:

```ts
function mapPhotoUrls(photos?: Array<{ photo_reference: string }>): string[] {
  return (photos ?? [])
    .slice(0, 4)
    .map((photo) => `/api/photo?ref=${encodeURIComponent(photo.photo_reference)}`)
}
```

Then set:

```ts
const photoUrls = mapPhotoUrls(r.photos)
photoUrl: photoUrls[0] ?? null
photoUrls
```

## UI Design

### Card Thumbnail Strip

Create `components/PhotoStrip.tsx`:

- Props: `photos: string[]`, `placeName: string`, optional `className`.
- Renders nothing when `photos.length === 0`.
- Shows up to four clickable thumbnail buttons.
- Uses `alt` text like `${placeName} photo ${index + 1}`.
- Uses `data-testid="photo-thumb-${index}"` for focused tests.
- Opens `PhotoLightbox` with the selected index.

### Lightbox

Create `components/PhotoLightbox.tsx`:

- Props: `photos`, `placeName`, `initialIndex`, `onClose`.
- Uses fixed overlay with warm journal-compatible neutral backdrop.
- Has close button with `aria-label="關閉照片"`.
- Has previous/next buttons when more than one photo exists.
- Supports Escape key close.
- Supports backdrop click close.
- Keeps keyboard focus behavior simple; no dependency added.

### Itinerary Card Integration

In `components/ItineraryCard.tsx`:

- Derive photos as:

```ts
const photos = place.photoUrls?.length ? place.photoUrls : place.photoUrl ? [place.photoUrl] : []
```

- Render `PhotoStrip` below the title/secondary name and above time/rating details.
- Do not change lock/time controls or drag behavior.

### Recommendation Card Integration

In `components/RecommendationCard.tsx`:

- Derive photos the same way as itinerary cards.
- Render `PhotoStrip` below title/type and above details.
- Keep the add button position and click target unchanged.

## API Design

`app/api/photo/route.ts` already proxies Google photos with `ref`. Keep the endpoint and API-key hiding behavior. Optional hardening during implementation:

- Keep returning `400` when `ref` is missing.
- Continue returning `502` when Google fails.
- Preserve `content-type` and cache header.
- Encode photo references before building URLs where callers generate proxy URLs.

## Testing Strategy

### Data Mapping Tests

Update `__tests__/nearby-search.test.ts` and add/extend tests for `getPlaceDetails` behavior:

- Multiple Google photos map to `photoUrls` with max four URLs.
- `photoUrl` equals the first `photoUrls` entry.
- Empty/missing photos produce `photoUrl: null` and `photoUrls: []` or no photos depending implementation choice.

### Component Tests

Update or add:

- `__tests__/photo-strip.test.tsx`
- `__tests__/itinerary-card-info.test.tsx`
- `__tests__/recommendation-card.test.tsx`

Assertions:

- Cards render four thumbnails when `photoUrls` has four entries.
- Cards fall back to one thumbnail when only `photoUrl` exists.
- Clicking a thumbnail opens the lightbox with the selected image.
- Close button and Escape close the lightbox.
- Next/previous buttons navigate between photos.

### Regression Tests

- Existing card info, recommendation, and photo route tests should continue passing.
- Existing fixtures without `photoUrls` should not require broad fixture churn.

## Risks

- `ItineraryCard.tsx` and `RecommendationCard.tsx` are shared surfaces. Keep changes isolated to rendering photos.
- `lib/types.ts` is broad. Only add an optional field to avoid breaking existing tests.
- Google photo references can include characters requiring URL encoding. Encode when constructing proxy URLs.
- Large visual changes can destabilize layout. Keep the strip compact and warm-journal compatible.

## Acceptance Criteria

- `Place` supports optional `photoUrls?: string[]`.
- `getPlaceDetails` and `nearbySearch` map up to four Google photos.
- Itinerary and recommendation cards show photo thumbnails when available.
- Lightbox opens from thumbnails and supports close, Escape, previous, and next.
- No empty photo UI appears for places without photos.
- Focused Jest tests pass for photo mapping, photo strip/lightbox, itinerary card, recommendation card, and photo route.