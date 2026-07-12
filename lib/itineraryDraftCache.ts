import type { Place, PlanResult, TransportMode } from '@/lib/types'

const CACHE_PREFIX = 'itineraryDraft:v1:'

export function buildItineraryDraftCacheKey(
  places: Place[],
  days: number,
  mode: TransportMode,
  startDate: string,
): string {
  const normalizedPlaces = places
    .map((place) => ({
      placeId: place.placeId,
      type: place.type,
      nightIndex: place.nightIndex ?? null,
    }))
    .sort((a, b) => {
      const placeCompare = a.placeId.localeCompare(b.placeId)
      if (placeCompare !== 0) return placeCompare
      const typeCompare = a.type.localeCompare(b.type)
      if (typeCompare !== 0) return typeCompare
      return String(a.nightIndex ?? '').localeCompare(String(b.nightIndex ?? ''))
    })

  return `${CACHE_PREFIX}${JSON.stringify({ places: normalizedPlaces, days, mode, startDate })}`
}

export function readItineraryDraft(storage: Storage, key: string): PlanResult | null {
  const raw = storage.getItem(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { plan?: PlanResult }
    return parsed.plan ?? null
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function writeItineraryDraft(storage: Storage, key: string, plan: PlanResult): void {
  storage.setItem(key, JSON.stringify({ plan, savedAt: new Date().toISOString() }))
}
