import { arrangeDayOrder } from '@/lib/utils/arrangeDay'
import type { DayItinerary, ScheduledPlace, DayArrangeInputs } from '@/lib/types'
import type { CrowdForecast } from '@/lib/crowd/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

const A = sp('A'), B = sp('B'), C = sp('C')
const day: DayItinerary = { day: 1, places: [A, B, C], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
// 2026-07-04 是星期六 → weekdayIndex = 5
const dateIso = '2026-07-04'

// 對稱距離矩陣（秒）：A-B 20分, A-C 40分, B-C 20分
const M = [
  [0, 1200, 2400],
  [1200, 0, 1200],
  [2400, 1200, 0],
]
// B 在星期六 10 點 high、13 點 low；A/C 無資料
function bCrowd(): CrowdForecast {
  const weekly: (number | null)[][] = Array.from({ length: 7 }, () => Array<number | null>(24).fill(0))
  weekly[5][10] = 80   // high
  weekly[5][13] = 10   // low
  return { source: 'heuristic', weekly, fetchedAt: '2026-07-01T00:00:00Z' }
}
const inputsNoCrowd: DayArrangeInputs = { indices: ['A', 'B', 'C'], matrix: M, crowdByPlaceId: {} }
const inputsCrowd: DayArrangeInputs = { indices: ['A', 'B', 'C'], matrix: M, crowdByPlaceId: { B: bCrowd() } }

function names(places: ScheduledPlace[]): string[] {
  return places.map((p) => p.name)
}

it('avoidTraffic only → shortest route order A,B,C', () => {
  const out = arrangeDayOrder(day, dateIso, inputsNoCrowd, { avoidTraffic: true, avoidCrowds: false })
  expect(names(out)).toEqual(['A', 'B', 'C'])
})

it('avoidCrowds only → reorders so B avoids its 10:00 peak (B at 09:00 → B,A,C)', () => {
  // 決定性首改善 2-opt 從現有順序 [A,B,C] 出發；把 B 移到首站（09:00，低於 10:00 尖峰）即達最低成本 → [B,A,C]
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: false, avoidCrowds: true })
  expect(names(out)).toEqual(['B', 'A', 'C'])
})

it('both → reorders to skip B peak (B,A,C)', () => {
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  expect(names(out)).toEqual(['B', 'A', 'C'])
})

it('refreshes travelMinToNext to match the new adjacency (last = null)', () => {
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  // B,A,C → B→A 20min, A→C 40min, C last → null
  expect(out[0].travelMinToNext).toBe(20)
  expect(out[1].travelMinToNext).toBe(40)
  expect(out[2].travelMinToNext).toBeNull()
})

it('keeps a startLocked place at its original index', () => {
  const lockedDay: DayItinerary = { ...day, places: [A, { ...B, startLocked: true, startTime: '10:30' }, C] }
  const out = arrangeDayOrder(lockedDay, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  expect(out[1].name).toBe('B')           // B fixed at index 1
  expect(out[1].startLocked).toBe(true)
})

it('is deterministic (same input → same output)', () => {
  const a = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  const b = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: true, avoidCrowds: true })
  expect(names(a)).toEqual(names(b))
})

it('no-op when both options are off (order unchanged, travel still refreshed)', () => {
  const out = arrangeDayOrder(day, dateIso, inputsCrowd, { avoidTraffic: false, avoidCrowds: false })
  expect(names(out)).toEqual(['A', 'B', 'C'])
})
