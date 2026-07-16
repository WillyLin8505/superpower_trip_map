import type { Candidate, DayRecommendation, Place, RecommendationsByDay } from '@/lib/types'
import {
  archivePlaceKey,
  filterRecommendationsByUnavailable,
  inferPlaceIndexSource,
  unavailableRecommendationKeys,
  upsertArchived,
} from '@/lib/itineraryClientState'

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'local-1',
    placeId: 'google-1',
    name: 'Test Place',
    type: 'attraction',
    lat: 25,
    lng: 121,
    address: 'Test Address',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
    ...overrides,
  }
}

function recommendation(overrides: Partial<DayRecommendation> = {}): DayRecommendation {
  return {
    ...place(overrides),
    reason: 'Reason',
    sourceLabel: 'Source',
    ...overrides,
  }
}

function candidate(id: string, candidatePlace: Place): Candidate {
  return {
    id,
    place: candidatePlace,
    addedBy: 'user-1',
    addedByName: 'User',
  }
}

describe('itinerary client state helpers', () => {
  it('dedupes archived candidates by previous id and place identity', () => {
    const archivedPlace = place({ id: 'old-local', placeId: 'google-1' })
    const duplicate = candidate('old-candidate', archivedPlace)
    const unrelated = candidate('keep-candidate', place({ id: 'local-2', placeId: 'google-2' }))
    const replacement = candidate('new-candidate', place({ id: 'new-local', placeId: 'google-1' }))

    expect(upsertArchived([duplicate, unrelated], replacement, 'old-candidate')).toEqual([
      unrelated,
      replacement,
    ])
  })

  it('builds unavailable recommendation keys from itinerary, LINE, and archived lists', () => {
    const itineraryPlace = place({ id: 'itinerary-local', placeId: 'google-itinerary' })
    const linePlace = place({ id: 'line-local', placeId: '' })
    const archivedPlace = place({ id: 'archived-local', placeId: 'google-archived' })

    const keys = unavailableRecommendationKeys(
      [{ day: 1, dayStart: '09:00', dayEnd: '21:00', aiSummary: null, places: [itineraryPlace as never] }],
      [candidate('line', linePlace)],
      [candidate('archived', archivedPlace)]
    )

    expect(keys).toEqual(new Set([
      archivePlaceKey(itineraryPlace),
      archivePlaceKey(linePlace),
      archivePlaceKey(archivedPlace),
    ]))
  })

  it('filters shown and reserve recommendations already present elsewhere', () => {
    const duplicate = recommendation({ id: 'dup-local', placeId: 'google-dup' })
    const keep = recommendation({ id: 'keep-local', placeId: 'google-keep' })
    const recommendations: RecommendationsByDay = [{
      dessert: { shown: [duplicate, keep], reserve: [duplicate] },
      attraction: { shown: [duplicate], reserve: [keep] },
      restaurant: { shown: [keep], reserve: [duplicate, keep] },
    }]

    expect(filterRecommendationsByUnavailable(recommendations, new Set([archivePlaceKey(duplicate)]))).toEqual([{
      dessert: { shown: [keep], reserve: [] },
      attraction: { shown: [], reserve: [keep] },
      restaurant: { shown: [keep], reserve: [keep] },
    }])
  })

  it('infers place index source from explicit source, known prefix, or google default', () => {
    expect(inferPlaceIndexSource('anything', 'osm')).toBe('osm')
    expect(inferPlaceIndexSource('wikidata:Q1')).toBe('wikidata')
    expect(inferPlaceIndexSource('ChIJ123')).toBe('google')
  })
})
