import { buildDayEmbedUrl, buildPlaceMapsUrl } from '@/lib/utils/mapUrl'
import type { ScheduledPlace } from '@/lib/types'

process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = 'TEST_KEY'

function makePlace(lat: number, lng: number): ScheduledPlace {
  return {
    id: 'id', placeId: 'pid', name: 'Place', type: 'attraction',
    lat, lng, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false,
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

// --- TASK-012: buildPlaceMapsUrl ---
describe('buildPlaceMapsUrl', () => {
  test('includes query_place_id when placeId is present', () => {
    const url = buildPlaceMapsUrl({ name: '台北101', placeId: 'ChIJ-abc123', address: '台北市信義區' })
    expect(url).toContain('https://www.google.com/maps/search/?')
    expect(url).toContain('query=%E5%8F%B0%E5%8C%97101')
    expect(url).toContain('query_place_id=ChIJ-abc123')
  })

  test('falls back to name when placeId is missing', () => {
    const url = buildPlaceMapsUrl({ name: '鼎泰豐', placeId: null, address: '台北市' })
    expect(url).toContain('query=%E9%BC%8E%E6%B3%B0%E8%B1%90')
    expect(url).not.toContain('query_place_id')
  })

  test('falls back to address when name is empty', () => {
    const url = buildPlaceMapsUrl({ name: '', placeId: undefined, address: '台北市中正區' })
    expect(url).toContain(`query=${encodeURIComponent('台北市中正區')}`)
  })

  test('uses official api=1 Maps URL format', () => {
    const url = buildPlaceMapsUrl({ name: 'Place', placeId: 'p1', address: '' })
    expect(url).toContain('api=1')
  })
})
