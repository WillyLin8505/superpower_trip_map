import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import type { ScheduledPlace } from '@/lib/types'

process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'TEST_KEY'

function makePlace(lat: number, lng: number): ScheduledPlace {
  return {
    id: 'id', placeId: 'pid', name: 'Place', type: 'attraction',
    lat, lng, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
    lateExit: false, timeLocked: false,
  }
}

test('returns empty string for 0 places', () => {
  expect(buildDayEmbedUrl([], 'driving')).toBe('')
})

test('returns empty string for 1 place', () => {
  expect(buildDayEmbedUrl([makePlace(25.04, 121.56)], 'driving')).toBe('')
})

test('builds valid URL for 2 places with no waypoints', () => {
  const url = buildDayEmbedUrl(
    [makePlace(25.04, 121.56), makePlace(25.05, 121.57)],
    'driving'
  )
  expect(url).toContain('maps.google.com/maps/embed/v1/directions')
  expect(url).toContain('key=TEST_KEY')
  expect(url).toContain('origin=')
  expect(url).toContain('destination=')
  expect(url).not.toContain('waypoints=')
  expect(url).toContain('mode=driving')
})

test('includes waypoints for 3+ places', () => {
  const url = buildDayEmbedUrl(
    [makePlace(25.04, 121.56), makePlace(25.05, 121.57), makePlace(25.06, 121.58)],
    'walking'
  )
  expect(url).toContain('waypoints=')
  expect(url).toContain('mode=walking')
})

test('maps transit mode correctly', () => {
  const url = buildDayEmbedUrl(
    [makePlace(25.04, 121.56), makePlace(25.05, 121.57)],
    'transit'
  )
  expect(url).toContain('mode=transit')
})
