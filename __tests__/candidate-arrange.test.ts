import { groupCandidatesByDay } from '@/lib/utils/candidateArrange'
import type { Candidate, DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, lat: number, lng: number): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false }
}
function day(d: number, places: ScheduledPlace[]): DayItinerary {
  return { day: d, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
function cand(id: string, lat: number, lng: number): Candidate {
  return { id, addedBy: 'u', addedByName: 'X',
    place: { id, placeId: id, name: id, type: 'attraction', lat, lng, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null } }
}

it('assigns each candidate to the geographically nearest day', () => {
  const days = [day(1, [sp('east', 25.05, 121.60)]), day(2, [sp('west', 25.05, 121.50)])]
  const cands = [cand('c-east', 25.04, 121.61), cand('c-west', 25.06, 121.49)]
  const out = groupCandidatesByDay(days, cands)
  expect(out).toHaveLength(2)
  expect(out[0].map((c) => c.id)).toEqual(['c-east'])
  expect(out[1].map((c) => c.id)).toEqual(['c-west'])
})

it('round-robins by index when all days are empty (no anchors)', () => {
  const days = [day(1, []), day(2, []), day(3, [])]
  const cands = [cand('a', 0, 0), cand('b', 0, 0), cand('c', 0, 0), cand('d', 0, 0)]
  const out = groupCandidatesByDay(days, cands)
  expect(out[0].map((c) => c.id)).toEqual(['a', 'd'])
  expect(out[1].map((c) => c.id)).toEqual(['b'])
  expect(out[2].map((c) => c.id)).toEqual(['c'])
})

it('output length equals days.length; empty candidates → all empty buckets', () => {
  const days = [day(1, [sp('x', 0, 0)]), day(2, [])]
  expect(groupCandidatesByDay(days, [])).toEqual([[], []])
})

it('with some empty days, candidates attach to nearest non-empty day (empty day stays empty)', () => {
  const days = [day(1, [sp('anchor', 25.05, 121.60)]), day(2, [])]
  const out = groupCandidatesByDay(days, [cand('c', 25.04, 121.61)])
  expect(out[0].map((c) => c.id)).toEqual(['c'])
  expect(out[1]).toEqual([])
})
