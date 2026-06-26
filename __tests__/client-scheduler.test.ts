import { recalcPlan } from '@/lib/utils/clientScheduler'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

function makePlace(overrides: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: Math.random().toString(),
    placeId: 'pid',
    name: 'place',
    type: 'attraction',
    lat: 25.0,
    lng: 121.5,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
    startTime: '09:00',
    durationMin: 60,
    travelMinToNext: 0,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    timeLocked: false,
    ...overrides,
  }
}

function makePlan(places: ScheduledPlace[]): PlanResult {
  return { days: [{ day: 1, places, aiSummary: null }], transportMode: 'driving' }
}

// --- No locked cards: simple forward fill ---
test('no locked cards: first place starts at 09:00', () => {
  const p1 = makePlace({ durationMin: 90, travelMinToNext: 30 })
  const p2 = makePlace({ durationMin: 60, travelMinToNext: 0 })
  const result = recalcPlan(makePlan([p1, p2]))
  expect(result.days[0].places[0].startTime).toBe('09:00')
  expect(result.days[0].places[1].startTime).toBe('11:00') // 09:00 + 90 + 30 = 11:00
})

// --- Leading segment backwards fill ---
test('one unlocked before locked: unlocked ends exactly at locked start', () => {
  // lock at 11:00, unlocked durationMin=60, travelMinToNext=30
  // expected: unlocked starts at 11:00 - 60 - 30 = 09:30
  const unlocked = makePlace({ durationMin: 60, travelMinToNext: 30 })
  const locked = makePlace({ startTime: '11:00', durationMin: 90, travelMinToNext: 0, timeLocked: true })
  const result = recalcPlan(makePlan([unlocked, locked]))
  expect(result.days[0].places[0].startTime).toBe('09:30')
  expect(result.days[0].places[1].startTime).toBe('11:00') // lock unchanged
})

// --- Trailing segment forward fill ---
test('unlocked after locked: starts at lock end', () => {
  // lock at 10:00, durationMin=60, travelMinToNext=30 → next starts at 11:30
  const locked = makePlace({ startTime: '10:00', durationMin: 60, travelMinToNext: 30, timeLocked: true })
  const after = makePlace({ durationMin: 90, travelMinToNext: 0 })
  const result = recalcPlan(makePlan([locked, after]))
  expect(result.days[0].places[0].startTime).toBe('10:00') // lock unchanged
  expect(result.days[0].places[1].startTime).toBe('11:30') // 10:00 + 60 + 30
})

// --- Lock in middle ---
test('unlocked before and after locked', () => {
  const before = makePlace({ durationMin: 60, travelMinToNext: 30 })
  const locked = makePlace({ startTime: '11:00', durationMin: 90, travelMinToNext: 30, timeLocked: true })
  const after = makePlace({ durationMin: 60, travelMinToNext: 0 })
  const result = recalcPlan(makePlan([before, locked, after]))
  // before: starts at 11:00 - 60 - 30 = 09:30
  expect(result.days[0].places[0].startTime).toBe('09:30')
  // lock unchanged
  expect(result.days[0].places[1].startTime).toBe('11:00')
  // after: 11:00 + 90 + 30 = 13:00
  expect(result.days[0].places[2].startTime).toBe('13:00')
})

// --- outsideHours when before DAY_START ---
test('outsideHours true when backwards fill goes before 09:00', () => {
  // lock at 09:30, unlocked durationMin=90 travelMinToNext=0
  // backwards: startMin = 9*60+30 - 90 - 0 = 480 = 08:00 < DAY_START
  const unlocked = makePlace({ durationMin: 90, travelMinToNext: 0 })
  const locked = makePlace({ startTime: '09:30', durationMin: 60, travelMinToNext: 0, timeLocked: true })
  const result = recalcPlan(makePlan([unlocked, locked]))
  expect(result.days[0].places[0].outsideHours).toBe(true)
  expect(result.days[0].places[0].startTime).toBe('08:00')
})

// --- lock's own outsideHours/lateExit recomputed ---
test('locked place outsideHours recomputed', () => {
  // lock has null openingHours → checkOutsideHours returns false
  const locked = makePlace({ startTime: '10:00', durationMin: 60, timeLocked: true, openingHours: null, outsideHours: true })
  const result = recalcPlan(makePlan([locked]))
  expect(result.days[0].places[0].outsideHours).toBe(false)
})

test('locked card at 08:00 with null openingHours gets outsideHours true', () => {
  const locked = makePlace({ startTime: '08:00', durationMin: 60, travelMinToNext: 0, timeLocked: true, openingHours: null, outsideHours: false })
  const result = recalcPlan(makePlan([locked]))
  expect(result.days[0].places[0].outsideHours).toBe(true)
})

// --- multi-lock overflow past next lock's start ---
test('between-segment overflow past next lock gets outsideHours true', () => {
  const lock1 = makePlace({ startTime: '10:00', durationMin: 60, travelMinToNext: 0, timeLocked: true })
  const overflow = makePlace({ durationMin: 90, travelMinToNext: 0, timeLocked: false })
  const lock2 = makePlace({ startTime: '11:00', durationMin: 60, travelMinToNext: 0, timeLocked: true })
  const result = recalcPlan(makePlan([lock1, overflow, lock2]))
  // overflow starts at 11:00 (lock1 ends 11:00), but lock2 also starts 11:00
  // overflow places start >= lock2.startTime => outsideHours true
  expect(result.days[0].places[1].outsideHours).toBe(true)
})

// --- multiple days processed independently ---
test('multiple days each recalculated independently', () => {
  const plan: PlanResult = {
    transportMode: 'driving',
    days: [
      { day: 1, places: [makePlace({ durationMin: 60, travelMinToNext: 0 })], aiSummary: null },
      { day: 2, places: [makePlace({ durationMin: 90, travelMinToNext: 0 })], aiSummary: null },
    ],
  }
  const result = recalcPlan(plan)
  expect(result.days[0].places[0].startTime).toBe('09:00')
  expect(result.days[1].places[0].startTime).toBe('09:00')
})
