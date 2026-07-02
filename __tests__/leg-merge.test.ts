import { legMerge } from '@/lib/utils/legMerge'
import type { ScheduledPlace, LegDefault } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const defaults: LegDefault[] = [
  { legMode: 'driving', travelMin: 18 },
  { legMode: 'walking', travelMin: 8 },
]

it('keeps a manual leg when its next place is unchanged', () => {
  // A manually set to transit toward B; A still precedes B → preserved
  const places = [sp('A', { legMode: 'transit', travelMinToNext: 25, legManualNext: 'B' }), sp('B'), sp('C')]
  const out = legMerge(places, defaults)
  expect(out[0].legMode).toBe('transit')
  expect(out[0].travelMinToNext).toBe(25)
  expect(out[0].legManualNext).toBe('B')
})
it('drops a manual leg when its recorded next no longer follows it', () => {
  // A manual toward B, but now A precedes C → reverts to default, clears legManualNext
  const places = [sp('A', { legMode: 'transit', travelMinToNext: 25, legManualNext: 'B' }), sp('C'), sp('B')]
  const out = legMerge(places, defaults)
  expect(out[0].legMode).toBe('driving')
  expect(out[0].travelMinToNext).toBe(18)
  expect(out[0].legManualNext).toBeUndefined()
})
it('applies defaults to non-manual legs', () => {
  const places = [sp('A'), sp('B'), sp('C')]
  const out = legMerge(places, defaults)
  expect(out[0].legMode).toBe('driving')
  expect(out[1].legMode).toBe('walking')
  expect(out[1].travelMinToNext).toBe(8)
})
it('clears the last place leg fields', () => {
  const places = [sp('A'), sp('B')]
  const out = legMerge(places, [{ legMode: 'driving', travelMin: 18 }])
  expect(out[1].legMode).toBeUndefined()
  expect(out[1].travelMinToNext).toBeNull()
  expect(out[1].legManualNext).toBeUndefined()
})
