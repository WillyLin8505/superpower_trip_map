import type { DayItinerary, PlanResult, ScheduledPlace } from '@/lib/types'
import { findContainer, applyDragResult } from '@/lib/utils/dragContainers'

function makePlace(id: string): ScheduledPlace {
  return {
    id, placeId: id, name: id, type: 'attraction',
    lat: 25, lng: 121, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false,
  }
}

function makeDay(dayNum: number, placeIds: string[]): DayItinerary {
  return { day: dayNum, places: placeIds.map(makePlace), aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}

const PLAN: PlanResult = {
  transportMode: 'driving',
  startDate: '2026-06-01',
  days: [
    makeDay(1, ['a', 'b', 'c']),
    makeDay(2, ['d', 'e']),
  ],
}

describe('findContainer', () => {
  test('finds day index by place id', () => {
    expect(findContainer('a', PLAN.days)).toBe(0)
    expect(findContainer('d', PLAN.days)).toBe(1)
  })

  test('finds day index by day- prefix', () => {
    expect(findContainer('day-0', PLAN.days)).toBe(0)
    expect(findContainer('day-1', PLAN.days)).toBe(1)
  })

  test('returns -1 for unknown id', () => {
    expect(findContainer('unknown', PLAN.days)).toBe(-1)
  })

  test('returns -1 for non-numeric day- suffix', () => {
    expect(findContainer('day-special', PLAN.days)).toBe(-1)
  })

  test('returns -1 for out-of-bounds day index', () => {
    expect(findContainer('day-99', PLAN.days)).toBe(-1)
  })
})

describe('applyDragResult', () => {
  test('same-day reorder: moves b before a', () => {
    const result = applyDragResult(PLAN, 'b', 'a')
    expect(result.days[0].places.map((p) => p.id)).toEqual(['b', 'a', 'c'])
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'e'])
  })

  test('same-day reorder: clears travelMinToNext', () => {
    const planWithTravel: PlanResult = {
      ...PLAN,
      days: [
        {
          ...PLAN.days[0],
          places: PLAN.days[0].places.map((p) => ({ ...p, travelMinToNext: 10 })),
        },
        PLAN.days[1],
      ],
    }
    const result = applyDragResult(planWithTravel, 'b', 'a')
    result.days[0].places.forEach((p) => expect(p.travelMinToNext).toBeNull())
  })

  test('cross-day move: inserts at target card position', () => {
    // drag 'a' from day 0, drop on 'e' in day 1 → inserts before 'e'
    const result = applyDragResult(PLAN, 'a', 'e')
    expect(result.days[0].places.map((p) => p.id)).toEqual(['b', 'c'])
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'a', 'e'])
  })

  test('cross-day move: appends when dropped on day container', () => {
    const result = applyDragResult(PLAN, 'a', 'day-1')
    expect(result.days[0].places.map((p) => p.id)).toEqual(['b', 'c'])
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'e', 'a'])
  })

  test('cross-day move: clears travelMinToNext in both days', () => {
    const planWithTravel: PlanResult = {
      ...PLAN,
      days: PLAN.days.map((day) => ({
        ...day,
        places: day.places.map((p) => ({ ...p, travelMinToNext: 10 })),
      })),
    }
    const result = applyDragResult(planWithTravel, 'a', 'day-1')
    result.days[0].places.forEach((p) => expect(p.travelMinToNext).toBeNull())
    result.days[1].places.forEach((p) => expect(p.travelMinToNext).toBeNull())
  })

  test('returns same plan reference when source not found', () => {
    const result = applyDragResult(PLAN, 'unknown', 'b')
    expect(result).toBe(PLAN)
  })

  test('source day is empty after moving its last place', () => {
    const singlePlacePlan: PlanResult = {
      ...PLAN,
      days: [makeDay(1, ['only']), makeDay(2, ['d', 'e'])],
    }
    const result = applyDragResult(singlePlacePlan, 'only', 'day-1')
    expect(result.days[0].places).toHaveLength(0)
    expect(result.days[1].places.map((p) => p.id)).toEqual(['d', 'e', 'only'])
  })
})
