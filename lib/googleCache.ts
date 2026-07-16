import { unstable_cache } from 'next/cache'

import { googleMapsCacheSeconds } from '@/lib/googleMapsCost'

// `fetch(..., { cache: 'force-cache' })` is silently ignored inside Server
// Actions / dynamic Route Handlers, so identical Google lookups (Nearby Search,
// Place Details, place-photo metadata) re-hit Google on every call — the top
// cost driver. Wrap the expensive RESULT in the Next Data Cache keyed by its
// inputs so repeated identical lookups are served without a Google call.
//
// On a cache MISS the fetcher runs in the current async context, so the trip
// attribution (runWithTripId) and api_usage_events logging inside it are
// preserved. On a cache HIT the fetcher never runs → no Google call, no cost,
// and (correctly) no usage event.
export function cachedGoogle<T>(
  keyParts: string[],
  fetcher: () => Promise<T>,
  revalidateSec: number = googleMapsCacheSeconds(),
): Promise<T> {
  return unstable_cache(fetcher, ['google', ...keyParts], { revalidate: revalidateSec })()
}

// Google API `status` values that are transient/quota/auth failures rather than a
// real answer. Cachers must THROW on these (so cachedGoogle does not persist a
// failure) — only deterministic outcomes (OK, ZERO_RESULTS, NOT_FOUND, …) may be
// cached. See callers in app/actions/places.ts and app/api/place-photos.
export const RETRYABLE_GOOGLE_STATUSES = new Set([
  'OVER_QUERY_LIMIT',
  'REQUEST_DENIED',
  'UNKNOWN_ERROR',
])
