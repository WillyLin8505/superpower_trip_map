# Place Photos Lightbox GSD PLAN

Phase: TASK-011 - Place Photos Lightbox
Status: ready_for_worker
Spec: `docs/superpowers/specs/2026-07-10-place-photos-lightbox-design.md`
Implementation plan: `docs/superpowers/plans/2026-07-10-place-photos-lightbox.md`

## Objective

Implement up to five Google photos per place and an in-app lightbox for itinerary and recommendation cards without changing scheduling, lock, drag, or recommendation-center behavior.

## Scope

In scope:

- Add optional `Place.photoUrls?: string[]`.
- Map up to five Google Places photos in `getPlaceDetails` and `nearbySearch`.
- Keep `photoUrl` as first-photo compatibility field.
- Add `PhotoStrip` and `PhotoLightbox` client components.
- Render photos in `ItineraryCard` and `RecommendationCard`.
- Add Jest/RTL coverage for mapping, thumbnails, lightbox, and card integration.

Out of scope:

- TASK-012 map drawer.
- User uploads.
- Database migrations.
- Card time/lock redesign.

## Worker Task

### TASK-011 - Implement five Google photos per place and lightbox

- Task type: frontend
- Status: todo
- Priority: medium
- Spec: `docs/superpowers/specs/2026-07-10-place-photos-lightbox-design.md`
- Estimated scope: large
- Files likely to change:
  - `lib/types.ts`
  - `app/actions/places.ts`
  - `app/api/photo/route.ts`
  - `components/ItineraryCard.tsx`
  - `components/RecommendationCard.tsx`
  - `components/PhotoStrip.tsx`
  - `components/PhotoLightbox.tsx`
  - `__tests__/nearby-search.test.ts`
  - `__tests__/photo-route.test.ts`
  - `__tests__/photo-strip.test.tsx`
  - `__tests__/itinerary-card-info.test.tsx`
  - `__tests__/recommendation-card.test.tsx`
- Dependencies: TASK-003, TASK-008
- Blocking tasks: TASK-012
- Conflict risk: high
- Can run in parallel: no
- Required review: GStack review/challenge after implementation
- Suggested session count: 1
- Safe to assign to any session: no

## Dependencies

Complete:

- TASK-003 - Place localization spec.
- TASK-008 - Localized place resolution.

Blocked by active locks:

- None at planning time after spec regeneration.

Conflicts:

- TASK-012 because both modify itinerary/recommendation card surfaces.
- Any task that changes `lib/types.ts`, `app/actions/places.ts`, or `components/ItineraryCard.tsx`.

## Verification Loop

1. Run focused RED tests before implementation:
   - `npx jest __tests__/nearby-search.test.ts --runInBand`
   - `npx jest __tests__/photo-strip.test.tsx --runInBand`
   - `npx jest __tests__/itinerary-card-info.test.tsx __tests__/recommendation-card.test.tsx --runInBand`
2. Implement minimal code.
3. Run focused GREEN tests:
   - `npx jest __tests__/nearby-search.test.ts __tests__/photo-route.test.ts __tests__/photo-strip.test.tsx __tests__/itinerary-card-info.test.tsx __tests__/recommendation-card.test.tsx --runInBand`
4. Run `npx tsc --noEmit`.
5. If clean, run `$multi-handoff-task` and include evidence.

## Manager Planning Updates

- Remove TASK-011 from `## Un Spec` once this file and the Superpowers design spec exist.
- Keep TASK-011 as `todo` until a worker claims it.
- Keep `## Locked Files` as `No active locks.` until claim.
- Ensure future claim writes owner folder name in each lock line.
