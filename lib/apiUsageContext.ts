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
