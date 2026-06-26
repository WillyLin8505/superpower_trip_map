import { findClosestDay } from '@/lib/utils/geo'
import type { DayItinerary } from '@/lib/types'

function makeDay(places: { lat: number; lng: number }[]): DayItinerary {
  return {
    day: 1,
    aiSummary: null,
    places: places.map((p, i) => ({
      id: `id-${i}`,
      placeId: `pid-${i}`,
      name: 'place',
      type: 'attraction' as const,
      lat: p.lat,
      lng: p.lng,
      address: '',
      openingHours: null,
      rating: null,
      photoUrl: null,
      description: null,
      startTime: '09:00',
      durationMin: 90,
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      timeLocked: false,
    })),
  }
}

test('returns 0 when only one day', () => {
  const days = [makeDay([{ lat: 25.0, lng: 121.5 }])]
  expect(findClosestDay(days, { lat: 25.1, lng: 121.6 })).toBe(0)
})

test('returns index of closer centroid', () => {
  const day0 = makeDay([{ lat: 25.0, lng: 121.5 }])   // near Taipei
  const day1 = makeDay([{ lat: 22.6, lng: 120.3 }])   // near Kaohsiung
  const newPlace = { lat: 25.05, lng: 121.55 }         // near Taipei
  expect(findClosestDay([day0, day1], newPlace)).toBe(0)
})

test('skips empty days (treats them as infinitely far)', () => {
  const emptyDay = makeDay([])
  const populatedDay = makeDay([{ lat: 25.0, lng: 121.5 }])
  const newPlace = { lat: 25.0, lng: 121.5 }
  expect(findClosestDay([emptyDay, populatedDay], newPlace)).toBe(1)
})

test('uses centroid of multiple places per day', () => {
  // Day 0 centroid = (25.0, 121.5)
  const day0 = makeDay([{ lat: 24.9, lng: 121.4 }, { lat: 25.1, lng: 121.6 }])
  // Day 1 centroid = (22.6, 120.3)
  const day1 = makeDay([{ lat: 22.6, lng: 120.3 }])
  expect(findClosestDay([day0, day1], { lat: 25.0, lng: 121.5 })).toBe(0)
})
