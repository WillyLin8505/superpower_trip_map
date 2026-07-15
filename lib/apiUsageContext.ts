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
// /api/place-photos) triggered by <img>/fetch from an itinerary page.
// The Referer carries `/itinerary/<tripId>`. This is client-controlled, so we
// only use it for a cosmetic per-trip cost estimate — never for authorization:
// URL-parse it, require the same origin as the request, and anchor the match to
// the start of the path so a crafted string can't inject an arbitrary trip id.
// Absent/foreign/malformed referer → undefined (recorded as trip_id=null).
export function tripIdFromReferer(
  referer: string | null | undefined,
  expectedOrigin?: string,
): string | undefined {
  if (!referer) return undefined
  let url: URL
  try {
    url = new URL(referer)
  } catch {
    return undefined
  }
  if (expectedOrigin && url.origin !== expectedOrigin) return undefined
  const match = /^\/itinerary\/([^/?#]+)/.exec(url.pathname)
  return match ? decodeURIComponent(match[1]) : undefined
}
