// __tests__/crowd-heuristic.test.ts
import { estimateCrowd } from '@/lib/crowd/heuristic'
import type { Place } from '@/lib/types'

function place(over: Partial<Place> = {}): Place {
  return {
    id: 'id', placeId: 'pid', name: 'X', type: 'attraction',
    lat: 0, lng: 0, address: 'addr', openingHours: null, rating: null,
    photoUrl: null, description: null, ...over,
  }
}

test('accommodation → all null', () => {
  const f = estimateCrowd(place({ type: 'accommodation' }))
  expect(f.source).toBe('heuristic')
  expect(f.weekly.flat().every((v) => v === null)).toBe(true)
})

test('restaurant lunch peak higher than mid-afternoon', () => {
  const f = estimateCrowd(place({ type: 'restaurant' }))
  // Monday 12:00 (lunch) vs 15:00 (off-peak)
  expect((f.weekly[0][12] ?? 0)).toBeGreaterThan(f.weekly[0][15] ?? 0)
})

test('attraction weekend midday higher than weekday midday', () => {
  const f = estimateCrowd(place({ type: 'attraction' }))
  // Saturday(5) 12:00 vs Monday(0) 12:00
  expect((f.weekly[5][12] ?? 0)).toBeGreaterThan(f.weekly[0][12] ?? 0)
})

test('closed hours gated to null', () => {
  // Monday 9AM–5PM only
  const oh = [
    'Monday: 9:00 AM – 5:00 PM', 'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM', 'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM', 'Saturday: 9:00 AM – 5:00 PM',
    'Sunday: 9:00 AM – 5:00 PM',
  ]
  const f = estimateCrowd(place({ type: 'attraction', openingHours: oh }))
  expect(f.weekly[0][8]).toBeNull()    // before open
  expect(f.weekly[0][12]).not.toBeNull() // open
  expect(f.weekly[0][18]).toBeNull()   // after close
})

test('deterministic weekly (same input → same weekly)', () => {
  const a = estimateCrowd(place({ type: 'restaurant', rating: 4.5 }))
  const b = estimateCrowd(place({ type: 'restaurant', rating: 4.5 }))
  expect(a.weekly).toEqual(b.weekly)
})
