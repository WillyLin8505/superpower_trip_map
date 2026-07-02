import { applyLegDefaults } from '@/app/actions/legs'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

// 只 mock 距離矩陣，讓真實 computeLegPlan 在 applyLegDefaults 內跑（避免攔不到同檔內部呼叫）。
// 所有站同座標 (0,0) → haversine 0m ≤500 → 走步行；步行 300s = 5 分。
jest.mock('@/app/actions/directions', () => ({
  buildDistanceMatrix: jest.fn(async (places: { placeId: string }[], mode: 'driving' | 'walking' | 'transit') => ({
    indices: places.map((p) => p.placeId),
    matrix: places.map(() => places.map(() => ({ driving: 600, walking: 300, transit: 900 }[mode]))),
  })),
}))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 99, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function day(places: ScheduledPlace[]): DayItinerary {
  return { day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}

it('assigns legMode + travelMinToNext per leg and nulls the last', async () => {
  const out = await applyLegDefaults([day([sp('A'), sp('B'), sp('C')])], '2026-07-01')
  const places = out[0].places
  expect(places[0].legMode).toBe('walking')  // 0m ≤500 → walking
  expect(places[0].travelMinToNext).toBe(5)  // 300s
  expect(places[1].travelMinToNext).toBe(5)
  expect(places[2].legMode).toBeUndefined()
  expect(places[2].travelMinToNext).toBeNull()
})
it('re-times the day from its travel (start times reflect 5-min legs)', async () => {
  const out = await applyLegDefaults([day([sp('A'), sp('B')])], '2026-07-01')
  // A 09:00 (60min) + 5 travel → B at 10:05
  expect(out[0].places[0].startTime).toBe('09:00')
  expect(out[0].places[1].startTime).toBe('10:05')
})
