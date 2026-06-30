import { computeLegPlan, legDuration } from '@/app/actions/legs'
import type { Place, TransportMode } from '@/lib/types'

// 每個模式回不同的固定秒數，方便驗證取最快
const SECS: Record<TransportMode, number> = { driving: 600, walking: 2400, transit: 1500 }
jest.mock('@/app/actions/directions', () => ({
  buildDistanceMatrix: jest.fn(async (places: { placeId: string }[], mode: 'driving' | 'walking' | 'transit') => ({
    indices: places.map((p) => p.placeId),
    matrix: places.map(() => places.map(() => ({ driving: 600, walking: 2400, transit: 1500 }[mode]))),
  })),
}))

function p(name: string, lat = 0, lng = 0): Place {
  return { id: name, placeId: name, name, type: 'attraction', lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null }
}

it('computeLegPlan returns one LegDefault per leg', async () => {
  const out = await computeLegPlan([p('A', 0, 0), p('B', 0, 0.01), p('C', 0, 0.02)])
  expect(out).toHaveLength(2)
})
it('computeLegPlan: >500m leg picks fastest motorized (driving 10 < transit 25)', async () => {
  // 0.01° lng ≈ 1113m > 500 → motorized; driving 600s=10min vs transit 1500s=25min
  const out = await computeLegPlan([p('A', 0, 0), p('B', 0, 0.01)])
  expect(out[0]).toEqual({ legMode: 'driving', travelMin: 10 })
})
it('computeLegPlan: <=500m leg → walking', async () => {
  // 0.001° lng ≈ 111m <= 500 → walking (2400s = 40min)
  const out = await computeLegPlan([p('A', 0, 0), p('B', 0, 0.001)])
  expect(out[0]).toEqual({ legMode: 'walking', travelMin: 40 })
})
it('computeLegPlan returns [] for fewer than 2 places', async () => {
  expect(await computeLegPlan([p('A')])).toEqual([])
})
it('legDuration returns minutes for one leg + mode', async () => {
  expect(await legDuration(p('A'), p('B'), 'driving')).toBe(10)  // 600s
})
