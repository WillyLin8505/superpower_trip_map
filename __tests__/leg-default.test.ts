import { haversineMeters, haversineSeconds } from '@/lib/haversine'
import { pickLegDefault } from '@/lib/utils/legDefault'

it('haversineMeters is 0 for identical points', () => {
  expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0)
})
it('haversineMeters ~1113m for 0.01° lng at equator', () => {
  expect(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 })).toBeCloseTo(1113, -1)
})
it('haversineSeconds equals round(meters / 1.4) — behavior unchanged', () => {
  const a = { lat: 25.03, lng: 121.56 }, b = { lat: 25.04, lng: 121.57 }
  expect(haversineSeconds(a, b)).toBe(Math.round(haversineMeters(a, b) / 1.4))
})
it('pickLegDefault: <=500m → walking', () => {
  expect(pickLegDefault(400, 10, 20, 8)).toEqual({ legMode: 'walking', travelMin: 8 })
})
it('pickLegDefault: >500m → faster of driving/transit', () => {
  expect(pickLegDefault(600, 10, 20, 40)).toEqual({ legMode: 'driving', travelMin: 10 })
  expect(pickLegDefault(600, 25, 12, 40)).toEqual({ legMode: 'transit', travelMin: 12 })
})
it('pickLegDefault: >500m tie → driving wins (deterministic)', () => {
  expect(pickLegDefault(600, 15, 15, 40)).toEqual({ legMode: 'driving', travelMin: 15 })
})
