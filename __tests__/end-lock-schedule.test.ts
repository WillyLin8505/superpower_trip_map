import { recalcDay } from '@/lib/utils/clientScheduler'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 0, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const day = (places: ScheduledPlace[]): DayItinerary => ({ day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' })

it('an end-locked place is treated as an anchor: keeps its startTime, neighbours flow around it', () => {
  // B is end-locked at 14:00-15:00; A before it should be back-scheduled, C after forward-scheduled
  const out = recalcDay(day([
    sp('A', { durationMin: 60, travelMinToNext: 0 }),
    sp('B', { startTime: '14:00', durationMin: 60, endLocked: true, travelMinToNext: 0 }),
    sp('C', { durationMin: 60 }),
  ]), '2026-07-05')
  expect(out.places[1].startTime).toBe('14:00')      // anchor kept
  expect(out.places[0].startTime).toBe('13:00')      // A back-scheduled to end right at B
  expect(out.places[2].startTime).toBe('15:00')      // C forward from B end
})

it('a duration-locked-only place is NOT an anchor (flows forward from day start)', () => {
  const out = recalcDay(day([
    sp('A', { durationMin: 60, travelMinToNext: 0 }),
    sp('B', { startTime: '14:00', durationLocked: true }),
  ]), '2026-07-05')
  expect(out.places[0].startTime).toBe('09:00')
  expect(out.places[1].startTime).toBe('10:00')      // flowed, not anchored at 14:00
})
