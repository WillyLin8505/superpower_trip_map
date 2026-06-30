import {
  centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, capBuckets,
} from '@/lib/utils/dayRecommend'
import type { DayItinerary, DayRecommendation, PlaceType } from '@/lib/types'

function rec(placeId: string, type: PlaceType, lat = 25, lng = 121): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}

function day(lat: number, lng: number): DayItinerary {
  return {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      id: 'x', placeId: 'x', name: 'x', type: 'attraction', lat, lng, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }
}

test('centroidOf returns null for empty and the mean otherwise', () => {
  expect(centroidOf([])).toBeNull()
  expect(centroidOf([{ lat: 0, lng: 0 }, { lat: 2, lng: 4 }])).toEqual({ lat: 1, lng: 2 })
})

test('dedupeAndExclude drops excluded ids and duplicate placeIds', () => {
  const out = dedupeAndExclude(
    [rec('a', 'restaurant'), rec('a', 'restaurant'), rec('b', 'restaurant')],
    new Set(['b'])
  )
  expect(out.map((r) => r.placeId)).toEqual(['a'])
})

test('assignToDays sends each rec to the geographically closest day', () => {
  const days = [day(25.0, 121.5), day(22.6, 120.3)]   // Taipei, Kaohsiung
  const out = assignToDays(
    [rec('taipei', 'attraction', 25.05, 121.55), rec('kao', 'attraction', 22.6, 120.3)],
    days
  )
  expect(out[0].map((r) => r.placeId)).toEqual(['taipei'])
  expect(out[1].map((r) => r.placeId)).toEqual(['kao'])
})

test('bucketByCategory splits by type and ignores accommodation', () => {
  const b = bucketByCategory([
    rec('d', 'dessert'), rec('a', 'attraction'), rec('r', 'restaurant'), rec('h', 'accommodation'),
  ])
  expect(b.dessert.map((r) => r.placeId)).toEqual(['d'])
  expect(b.attraction.map((r) => r.placeId)).toEqual(['a'])
  expect(b.restaurant.map((r) => r.placeId)).toEqual(['r'])
})

test('capBuckets limits each category', () => {
  const many = Array.from({ length: 7 }, (_, i) => rec(`d${i}`, 'dessert'))
  const capped = capBuckets({ dessert: many, attraction: [], restaurant: [] }, 5)
  expect(capped.dessert).toHaveLength(5)
})
