import type { Candidate, Place, PlanResult, RecommendationsByDay } from '@/lib/types'
import type { PlaceIndexSource } from '@/lib/userPlaceIndex'
import { hasRecommendationIdentity, recommendationIdentityKeys } from '@/lib/utils/dayRecommend'

export function archivePlaceKey(place: Place): string {
  return place.placeId ? `place:${place.placeId}` : `local:${place.id}`
}

export function upsertArchived(current: Candidate[], next: Candidate, previousId?: string): Candidate[] {
  const nextKey = archivePlaceKey(next.place)
  const nextKeys = new Set(recommendationIdentityKeys(next.place))
  return [
    ...current.filter((candidate) =>
      candidate.id !== previousId &&
      candidate.id !== next.id &&
      archivePlaceKey(candidate.place) !== nextKey &&
      !recommendationIdentityKeys(candidate.place).some((key) => nextKeys.has(key))
    ),
    next,
  ]
}

function addUnavailableKeys(keys: Set<string>, place: Place): void {
  keys.add(archivePlaceKey(place))
  recommendationIdentityKeys(place).forEach((key) => keys.add(key))
}

export function unavailableRecommendationKeys(
  days: PlanResult['days'],
  lineCandidates: Candidate[],
  archivedCandidates: Candidate[]
): Set<string> {
  const keys = new Set<string>()
  days.forEach((day) => day.places.forEach((place) => addUnavailableKeys(keys, place)))
  lineCandidates.forEach((candidate) => addUnavailableKeys(keys, candidate.place))
  archivedCandidates.forEach((candidate) => addUnavailableKeys(keys, candidate.place))
  return keys
}

export function filterRecommendationsByUnavailable(
  recommendations: RecommendationsByDay | null,
  unavailableKeys: Set<string>
): RecommendationsByDay | null {
  if (!recommendations || unavailableKeys.size === 0) return recommendations

  return recommendations.map((dayRecommendations) => ({
    dessert: {
      shown: dayRecommendations.dessert.shown.filter((recommendation) => !hasRecommendationIdentity(unavailableKeys, recommendation)),
      reserve: dayRecommendations.dessert.reserve.filter((recommendation) => !hasRecommendationIdentity(unavailableKeys, recommendation)),
    },
    attraction: {
      shown: dayRecommendations.attraction.shown.filter((recommendation) => !hasRecommendationIdentity(unavailableKeys, recommendation)),
      reserve: dayRecommendations.attraction.reserve.filter((recommendation) => !hasRecommendationIdentity(unavailableKeys, recommendation)),
    },
    restaurant: {
      shown: dayRecommendations.restaurant.shown.filter((recommendation) => !hasRecommendationIdentity(unavailableKeys, recommendation)),
      reserve: dayRecommendations.restaurant.reserve.filter((recommendation) => !hasRecommendationIdentity(unavailableKeys, recommendation)),
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
