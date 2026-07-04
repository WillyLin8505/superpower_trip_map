import {
  centroidOf, dedupeAndExclude, assignToDays, bucketByCategory, splitShownReserve, removeRecsDay,
} from '@/lib/utils/dayRecommend'
import type { CategoryList, DayItinerary, DayRecommendation, PlaceType, RecommendationsByDay } from '@/lib/types'

function rec(placeId: string, type: PlaceType, lat = 25, lng = 121): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}

function bucketsWith(placeId: string): RecommendationsByDay[number] {
  const list = (shown: DayRecommendation[]): CategoryList => ({ shown, reserve: [] })
  return { dessert: list([rec(placeId, 'dessert')]), attraction: list([]), restaurant: list([]) }
}

test('removeRecsDay drops the removed day bucket and keeps the rest index-aligned', () => {
  const recs: RecommendationsByDay = [bucketsWith('day0'), bucketsWith('day1'), bucketsWith('day2')]
  const out = removeRecsDay(recs, 1)
  expect(out).toHaveLength(2)
  expect(out![0].dessert.shown[0].placeId).toBe('day0')
  expect(out![1].dessert.shown[0].placeId).toBe('day2')   // day2 shifted into index 1
})

test('removeRecsDay passes null through', () => {
  expect(removeRecsDay(null, 0)).toBeNull()
})

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

test('dedupeAndExclude drops excluded ids and duplicate placeIds, preserving order', () => {
  const out = dedupeAndExclude(
    [rec('a', 'restaurant'), rec('b', 'restaurant'), rec('a', 'restaurant')],
    new Set()
  )
  expect(out.map((r) => r.placeId)).toEqual(['a', 'b'])
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

test('assignToDays returns empty array when days is empty', () => {
  const out = assignToDays([rec('a', 'restaurant')], [])
  expect(out).toEqual([])
})

test('bucketByCategory splits by type and ignores accommodation', () => {
  const b = bucketByCategory([
    rec('d', 'dessert'), rec('a', 'attraction'), rec('r', 'restaurant'), rec('h', 'accommodation'),
  ])
  expect(b.dessert.map((r) => r.placeId)).toEqual(['d'])
  expect(b.attraction.map((r) => r.placeId)).toEqual(['a'])
  expect(b.restaurant.map((r) => r.placeId)).toEqual(['r'])
})

test('splitShownReserve puts the first `limit` in shown and the rest in reserve', () => {
  const items = Array.from({ length: 7 }, (_, i) => rec(`d${i}`, 'dessert'))
  const { shown, reserve } = splitShownReserve(items, 5)
  expect(shown.map((r) => r.placeId)).toEqual(['d0', 'd1', 'd2', 'd3', 'd4'])
  expect(reserve.map((r) => r.placeId)).toEqual(['d5', 'd6'])
})

test('splitShownReserve reserve is empty when items <= limit', () => {
  const items = [rec('a', 'dessert'), rec('b', 'dessert')]
  const { shown, reserve } = splitShownReserve(items, 5)
  expect(shown).toHaveLength(2)
  expect(reserve).toEqual([])
})
