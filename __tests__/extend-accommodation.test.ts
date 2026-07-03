import { recalcPlan } from '@/lib/utils/clientScheduler'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: 0, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function planOf(places: ScheduledPlace[], over: Partial<DayItinerary> = {}): PlanResult {
  return { days: [{ day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', ...over }],
    transportMode: 'driving', startDate: '2026-07-10' }
}
function last(p: PlanResult): ScheduledPlace { return p.days[0].places[p.days[0].places.length - 1] }

it('extends a last accommodation to end at dayEnd', () => {
  // A attraction 09:00 (90min, 0 travel) → H accommodation arrives 10:30; dayEnd 21:00 → duration 630
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('H', { type: 'accommodation', durationMin: 60 })]))
  expect(last(out).startTime).toBe('10:30')
  expect(last(out).durationMin).toBe(630) // 1260 - 630
})
it('does not extend a durationLocked accommodation', () => {
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('H', { type: 'accommodation', durationMin: 60, durationLocked: true })]))
  expect(last(out).durationMin).toBe(60)
})
it('does not extend when arrival is at/after dayEnd', () => {
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('H', { type: 'accommodation', durationMin: 60 })], { dayEnd: '10:00' }))
  expect(last(out).durationMin).toBe(60) // arrival 10:30 >= 10:00 → unchanged
})
it('does not touch a last non-accommodation place', () => {
  const out = recalcPlan(planOf([sp('A', { type: 'attraction', durationMin: 90 }), sp('B', { type: 'attraction', durationMin: 90 })]))
  expect(last(out).durationMin).toBe(90)
})
