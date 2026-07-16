import { haversineSeconds } from '@/lib/haversine'

test('same point returns 0', () => {
  expect(haversineSeconds({ lat: 25.0, lng: 121.5 }, { lat: 25.0, lng: 121.5 })).toBe(0)
})

test('Tokyo to Osaka ~250km walking ~200000s', () => {
  const s = haversineSeconds({ lat: 35.6762, lng: 139.6503 }, { lat: 34.6937, lng: 135.5023 })
  expect(s).toBeGreaterThan(100000)
})

it('driving estimate is much faster than walking for the same pair', () => {
  const a = { lat: 25.0330, lng: 121.5654 }
  const b = { lat: 25.0478, lng: 121.5170 } // ~5km across Taipei
  const walk = haversineSeconds(a, b, 'walking')
  const drive = haversineSeconds(a, b, 'driving')
  const transit = haversineSeconds(a, b, 'transit')
  expect(drive).toBeLessThan(walk / 3)        // ~5x faster
  expect(transit).toBeLessThan(walk / 2)
  expect(drive).toBeGreaterThan(0)
})

it('driving 3.5km straight-line is ~10 min, not 42 (the QA regression)', () => {
  const a = { lat: 25.033, lng: 121.5654 }
  const b = { lat: 25.033, lng: 121.60 } // ~3.5km east
  const driveMin = haversineSeconds(a, b, 'driving') / 60
  expect(driveMin).toBeGreaterThan(5)
  expect(driveMin).toBeLessThan(15)
})

it('default mode stays walking (geo/cluster comparisons unchanged)', () => {
  const a = { lat: 25.0, lng: 121.5 }
  const b = { lat: 25.01, lng: 121.5 }
  expect(haversineSeconds(a, b)).toBe(haversineSeconds(a, b, 'walking'))
})
