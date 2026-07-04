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
const D = (min: number, distM: number) => ({ min, distM })
it('pickLegDefault: <=500m → walking (carries walking distance)', () => {
  expect(pickLegDefault(400, D(10, 5000), D(20, 6000), D(8, 350)))
    .toEqual({ legMode: 'walking', travelMin: 8, travelDistanceM: 350 })
})
it('pickLegDefault: >500m → faster of driving/transit (carries its distance)', () => {
  expect(pickLegDefault(600, D(10, 5000), D(20, 6000), D(40, 800)))
    .toEqual({ legMode: 'driving', travelMin: 10, travelDistanceM: 5000 })
  expect(pickLegDefault(600, D(25, 5000), D(12, 6000), D(40, 800)))
    .toEqual({ legMode: 'transit', travelMin: 12, travelDistanceM: 6000 })
})
it('pickLegDefault: >500m tie → driving wins (deterministic)', () => {
  expect(pickLegDefault(600, D(15, 5000), D(15, 6000), D(40, 800)))
    .toEqual({ legMode: 'driving', travelMin: 15, travelDistanceM: 5000 })
})
