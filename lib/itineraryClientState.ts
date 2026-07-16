import type { Candidate, Place, PlanResult, RecommendationsByDay } from '@/lib/types'
import type { PlaceIndexSource } from '@/lib/userPlaceIndex'

export function archivePlaceKey(place: Place): string {
  return place.placeId ? `place:${place.placeId}` : `local:${place.id}`
}

export function upsertArchived(current: Candidate[], next: Candidate, previousId?: string): Candidate[] {
  const nextKey = archivePlaceKey(next.place)
  return [
    ...current.filter((candidate) =>
      candidate.id !== previousId &&
      candidate.id !== next.id &&
      archivePlaceKey(candidate.place) !== nextKey
    ),
    next,
  ]
}

export function unavailableRecommendationKeys(
  days: PlanResult['days'],
  lineCandidates: Candidate[],
  archivedCandidates: Candidate[]
): Set<string> {
  const keys = new Set<string>()
  days.forEach((day) => day.places.forEach((place) => keys.add(archivePlaceKey(place))))
  lineCandidates.forEach((candidate) => keys.add(archivePlaceKey(candidate.place)))
  archivedCandidates.forEach((candidate) => keys.add(archivePlaceKey(candidate.place)))
  return keys
}

export function filterRecommendationsByUnavailable(
  recommendations: RecommendationsByDay | null,
  unavailableKeys: Set<string>
): RecommendationsByDay | null {
  if (!recommendations || unavailableKeys.size === 0) return recommendations

  return recommendations.map((dayRecommendations) => ({
    dessert: {
      shown: dayRecommendations.dessert.shown.filter((recommendation) => !unavailableKeys.has(archivePlaceKey(recommendation))),
      reserve: dayRecommendations.dessert.reserve.filter((recommendation) => !unavailableKeys.has(archivePlaceKey(recommendation))),
    },
    attraction: {
      shown: dayRecommendations.attraction.shown.filter((recommendation) => !unavailableKeys.has(archivePlaceKey(recommendation))),
      reserve: dayRecommendations.attraction.reserve.filter((recommendation) => !unavailableKeys.has(archivePlaceKey(recommendation))),
    },
    restaurant: {
      shown: dayRecommendations.restaurant.shown.filter((recommendation) => !unavailableKeys.has(archivePlaceKey(recommendation))),
      reserve: dayRecommendations.restaurant.reserve.filter((recommendation) => !unavailableKeys.has(archivePlaceKey(recommendation))),
    },
  }))
}

export function inferPlaceIndexSource(placeId: string, source?: Place['source']): PlaceIndexSource {
  if (source) return source
  const prefix = placeId.split(':', 1)[0]
  return prefix === 'overture' || prefix === 'osm' || prefix === 'wikidata' || prefix === 'user'
    ? prefix
    : 'google'
}
