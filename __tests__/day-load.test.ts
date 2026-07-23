import { dayLoad } from '@/lib/utils/dayLoad'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function place(overrides: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: Math.random().toString(), placeId: 'pid', name: 'p', type: 'attraction',
    lat: 35, lng: 139, address: '', openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: 0, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...overrides,
  }
}
function day(places: ScheduledPlace[], dayStart = '09:00', dayEnd = '21:00'): DayItinerary {
  return { day: 1, places, aiSummary: null, dayStart, dayEnd }
}

test('ok state for a comfortably filled day', () => {
  // last activity ends 18:00 → used 540 / window 720 = 0.75
  const d = day([place({ startTime: '16:30', durationMin: 90 })])
  const load = dayLoad(d)
  expect(load.windowMin).toBe(720)
  expect(load.usedMin).toBe(540)
  expect(load.ratio).toBeCloseTo(0.75, 2)
  expect(load.state).toBe('ok')
})

test('over state when the last activity ends after dayEnd', () => {
  const d = day([place({ startTime: '21:30', durationMin: 60 })]) // ends 22:30 > 21:00
  const load = dayLoad(d)
  expect(load.state).toBe('over')
})

test('light state when the day ends early', () => {
  const d = day([place({ startTime: '11:00', durationMin: 120 })]) // ends 13:00 → used 240 / 720 = 0.33
  const load = dayLoad(d)
  expect(load.state).toBe('light')
})

test('empty state for a day with no places', () => {
  const load = dayLoad(day([]))
  expect(load.state).toBe('empty')
  expect(load.usedMin).toBe(0)
  expect(load.ratio).toBe(0)
})

test('a day ending at a hotel does not read 100% full (accommodation stretch excluded)', () => {
  // attraction 09:00–10:30, then hotel checked-in 20:00 stretched to fill 21:00 (durationMin 60).
  const d = day([
    place({ startTime: '09:00', durationMin: 90 }),
    place({ type: 'accommodation', startTime: '20:00', durationMin: 60 }),
  ])
  const load = dayLoad(d)
  // used measured to the hotel check-in (20:00), NOT the stretched end (21:00)
  expect(load.usedMin).toBe(660) // 20:00 - 09:00
  expect(load.state).not.toBe('over')
})
