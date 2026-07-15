import { AsyncLocalStorage } from 'async_hooks'

interface UsageContext {
  tripId: string | null
}

const storage = new AsyncLocalStorage<UsageContext>()

// Run `fn` with a trip attributed to any api_usage_events recorded inside it.
// Server actions that know the current trip wrap their body so every nested
// Google call (searchPlace → getPlaceDetails → fetch, buildDistanceMatrix, …)
// inherits the tripId without threading it through every function signature.
export function runWithTripId<T>(tripId: string | null | undefined, fn: () => T): T {
  // Inherit the ambient trip when none is supplied, so a nested
  // runWithTripId(undefined) (e.g. applyLegDefaults → computeLegPlan) does not
  // erase an outer trip context.
  return storage.run({ tripId: tripId ?? currentTripId() }, fn)
}

export function currentTripId(): string | null {
  return storage.getStore()?.tripId ?? null
}

// Best-effort trip attribution for stateless media routes (/api/photo,
// /api/place-photos) that are triggered by <img>/fetch from an itinerary page.
// The request's Referer carries `/itinerary/<tripId>`; absent referer → undefined
// (recorded as trip_id=null, same as before).
export function tripIdFromReferer(referer: string | null | undefined): string | undefined {
  if (!referer) return undefined
  const match = /\/itinerary\/([^/?#]+)/.exec(referer)
  return match ? decodeURIComponent(match[1]) : undefined
}
