// lib/crowd/index.ts
import type { Place } from '@/lib/types'
import type { CrowdForecast } from './types'
import { fetchBestTimeForecast } from './besttime'
import { estimateCrowd } from './heuristic'
import { InMemoryCrowdCache, type CrowdCache } from './cache'

const TTL_BESTTIME_MS = 14 * 24 * 60 * 60 * 1000 // 14 days
const TTL_HEURISTIC_MS = 24 * 60 * 60 * 1000      // 1 day

const defaultCache: CrowdCache = new InMemoryCrowdCache()

export async function getCrowdForecast(
  place: Place,
  cache: CrowdCache = defaultCache
): Promise<CrowdForecast> {
  const key = place.placeId || `${place.name}|${place.address}`

  const cached = cache.get(key)
  if (cached) return cached

  const bt = await fetchBestTimeForecast(place)
  if (bt) {
    cache.set(key, bt, TTL_BESTTIME_MS)
    return bt
  }

  const h = estimateCrowd(place)
  cache.set(key, h, TTL_HEURISTIC_MS)
  return h
}

export { levelAt } from './types'
export type { CrowdForecast, CrowdLevel, CrowdSource } from './types'
