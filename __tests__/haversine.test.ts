import { haversineSeconds } from '@/lib/haversine'

test('same point returns 0', () => {
  expect(haversineSeconds({ lat: 25.0, lng: 121.5 }, { lat: 25.0, lng: 121.5 })).toBe(0)
})

test('Tokyo to Osaka ~250km walking ~200000s', () => {
  const s = haversineSeconds({ lat: 35.6762, lng: 139.6503 }, { lat: 34.6937, lng: 135.5023 })
  expect(s).toBeGreaterThan(100000)
})
