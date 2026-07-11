import { rearrangeItinerary } from '@/app/actions/rearrange'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

const callClaude = jest.fn()
jest.mock('@/lib/claude', () => ({ callClaude: (p: string) => callClaude(p) }))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function d(day: number, places: ScheduledPlace[]): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
// refs: 1=A 2=B (day1), 3=C (day2)
function plan(): PlanResult {
  return { days: [d(1, [sp('A'), sp('B')]), d(2, [sp('C')])], transportMode: 'driving', startDate: '2026-07-10' }
}

beforeEach(() => { callClaude.mockReset() })

it('valid AI output → ok with the derived changes', async () => {
  // move ref 2 (B) from day1 to day2
  callClaude.mockResolvedValue(JSON.stringify({
    summary: '把 B 移到第 2 天',
    days: [
      { day: 1, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }] },
      { day: 2, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 3, durationMin: 90 }, { ref: 2, durationMin: 90 }] },
    ],
  }))
  const res = await rearrangeItinerary(plan(), '把B移到第二天')
  expect(res.ok).toBe(true)
  if (res.ok) {
    expect(res.summary).toBe('把 B 移到第 2 天')
    expect(res.changes).toContainEqual({ id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 })
  }
})

it('malformed JSON → ok:false', async () => {
  callClaude.mockResolvedValue('sorry I cannot do that')
  const res = await rearrangeItinerary(plan(), 'x')
  expect(res.ok).toBe(false)
})

it('refs not a 1..N permutation (missing ref) → ok:false', async () => {
  callClaude.mockResolvedValue(JSON.stringify({
    summary: 'x',
    days: [ { day: 1, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }] },
            { day: 2, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 3, durationMin: 90 }] } ], // ref 2 missing
  }))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})

it('day count mismatch → ok:false', async () => {
  callClaude.mockResolvedValue(JSON.stringify({
    summary: 'x',
    days: [ { day: 1, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }, { ref: 2, durationMin: 90 }, { ref: 3, durationMin: 90 }] } ], // 1 day, current has 2
  }))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})

it('callClaude throws → ok:false', async () => {
  callClaude.mockRejectedValue(new Error('network'))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})

it('out-of-range hour in activity window (24:00) → ok:false', async () => {
  callClaude.mockResolvedValue(JSON.stringify({
    summary: 'x',
    days: [ { day: 1, dayStart: '24:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }, { ref: 2, durationMin: 90 }] },
            { day: 2, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 3, durationMin: 90 }] } ],
  }))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})

it('out-of-range minute in activity window (12:60) → ok:false', async () => {
  callClaude.mockResolvedValue(JSON.stringify({
    summary: 'x',
    days: [ { day: 1, dayStart: '09:00', dayEnd: '12:60', places: [{ ref: 1, durationMin: 90 }, { ref: 2, durationMin: 90 }] },
            { day: 2, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 3, durationMin: 90 }] } ],
  }))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})

it('durationMin beyond a full day (99999) → ok:false', async () => {
  callClaude.mockResolvedValue(JSON.stringify({
    summary: 'x',
    days: [ { day: 1, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 1, durationMin: 90 }, { ref: 2, durationMin: 99999 }] },
            { day: 2, dayStart: '09:00', dayEnd: '21:00', places: [{ ref: 3, durationMin: 90 }] } ],
  }))
  expect((await rearrangeItinerary(plan(), 'x')).ok).toBe(false)
})
