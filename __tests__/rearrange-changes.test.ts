import { diffPlan, applyChanges, type Change } from '@/lib/utils/rearrangeChanges'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function dayOf(day: number, places: ScheduledPlace[], over: Partial<DayItinerary> = {}): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', ...over }
}
function plan(days: DayItinerary[]): PlanResult {
  return { days, transportMode: 'driving', startDate: '2026-07-10' }
}

it('diffPlan: a place moved to another day → one move change on the source day', () => {
  const A = sp('A'), B = sp('B'), C = sp('C')
  const current = plan([dayOf(1, [A, B]), dayOf(2, [C])])
  const proposed = plan([dayOf(1, [A]), dayOf(2, [C, B])]) // B moved 1→2
  expect(diffPlan(current, proposed)).toEqual([
    { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 },
  ])
})

it('diffPlan: duration change (unlocked) → duration change; locked → none', () => {
  const A = sp('A', { durationMin: 90 })
  const L = sp('L', { durationMin: 90, durationLocked: true })
  const current = plan([dayOf(1, [A, L])])
  const proposed = plan([dayOf(1, [sp('A', { durationMin: 60 }), sp('L', { durationMin: 60, durationLocked: true })])])
  expect(diffPlan(current, proposed)).toEqual([
    { id: 'dur-A', day: 1, kind: 'duration', placeId: 'A', placeName: 'A', from: 90, to: 60 },
  ])
})

it('diffPlan: activity window change → per-field window changes', () => {
  const A = sp('A')
  const current = plan([dayOf(1, [A], { dayStart: '09:00', dayEnd: '21:00' })])
  const proposed = plan([dayOf(1, [A], { dayStart: '10:00', dayEnd: '21:00' })])
  expect(diffPlan(current, proposed)).toEqual([
    { id: 'win-1-dayStart', day: 1, kind: 'window', field: 'dayStart', from: '09:00', to: '10:00' },
  ])
})

it('diffPlan: no changes → []', () => {
  const A = sp('A')
  expect(diffPlan(plan([dayOf(1, [A])]), plan([dayOf(1, [sp('A')])]))).toEqual([])
})

it('applyChanges: move removes from source and appends to target', () => {
  const A = sp('A'), B = sp('B'), C = sp('C')
  const current = plan([dayOf(1, [A, B]), dayOf(2, [C])])
  const move: Change = { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 }
  const out = applyChanges(current, [move])
  expect(out.days[0].places.map((p) => p.placeId)).toEqual(['A'])
  expect(out.days[1].places.map((p) => p.placeId)).toEqual(['C', 'B'])
})

it('applyChanges: duration set (locked kept), window set', () => {
  const A = sp('A', { durationMin: 90 })
  const L = sp('L', { durationMin: 90, durationLocked: true })
  const current = plan([dayOf(1, [A, L])])
  const changes: Change[] = [
    { id: 'dur-A', day: 1, kind: 'duration', placeId: 'A', placeName: 'A', from: 90, to: 60 },
    { id: 'dur-L', day: 1, kind: 'duration', placeId: 'L', placeName: 'L', from: 90, to: 60 },
    { id: 'win-1-dayStart', day: 1, kind: 'window', field: 'dayStart', from: '09:00', to: '10:00' },
  ]
  const out = applyChanges(current, changes)
  expect(out.days[0].places.find((p) => p.placeId === 'A')!.durationMin).toBe(60)
  expect(out.days[0].places.find((p) => p.placeId === 'L')!.durationMin).toBe(90) // locked kept
  expect(out.days[0].dayStart).toBe('10:00')
})

it('applyChanges: subset — rejecting one change leaves it unapplied, others still apply', () => {
  const A = sp('A'), B = sp('B'), C = sp('C')
  const current = plan([dayOf(1, [A, B]), dayOf(2, [C])])
  const _moveB: Change = { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 }
  const winC: Change = { id: 'win-2-dayEnd', day: 2, kind: 'window', field: 'dayEnd', from: '21:00', to: '22:00' }
  // accept only winC (_moveB rejected, deliberately not passed in)
  const out = applyChanges(current, [winC])
  expect(out.days[0].places.map((p) => p.placeId)).toEqual(['A', 'B']) // B NOT moved
  expect(out.days[1].dayEnd).toBe('22:00')
})

it('applyChanges does not mutate the input plan', () => {
  const A = sp('A'), B = sp('B')
  const current = plan([dayOf(1, [A, B])])
  applyChanges(current, [{ id: 'dur-A', day: 1, kind: 'duration', placeId: 'A', placeName: 'A', from: 90, to: 60 }])
  expect(current.days[0].places[0].durationMin).toBe(90) // unchanged
})
