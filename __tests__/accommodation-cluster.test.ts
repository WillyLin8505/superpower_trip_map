import { inferNightOrder, assignHotelsToDays, clusterAttractionsToDays, routeDay } from '@/lib/accommodation/cluster'
import type { Place } from '@/lib/types'

function p(name: string, lat: number, lng: number, type: Place['type'] = 'attraction'): Place {
  return { id: name, placeId: name, name, type, lat, lng, address: '', openingHours: null, rating: null, photoUrl: null, description: null }
}
// 一維排開：A(0) H1(1) B(2) H2(3) C(4)
const H1 = p('H1', 0, 1, 'accommodation')
const H2 = p('H2', 0, 3, 'accommodation')
const A = p('A', 0, 0), B = p('B', 0, 2.7), C = p('C', 0, 4)

it('inferNightOrder returns a deterministic chain of hotel indices', () => {
  const order = inferNightOrder([H1, H2], [A, B, C])
  expect(order.slice().sort()).toEqual([0, 1])
  expect(order.length).toBe(2)
})

it('assignHotelsToDays maps night j to day j, capped at last day', () => {
  const days = assignHotelsToDays([H1, H2], 3)
  expect(days[0]).toBe(H1)
  expect(days[1]).toBe(H2)
  expect(days[2]).toBeNull()
})

it('clusterAttractionsToDays sends each attraction to its nearest hotel day', () => {
  const dayHotels = [H1, H2, null]
  const buckets = clusterAttractionsToDays([A, B, C], dayHotels, 720, () => 90)
  expect(buckets[0]).toContain(A) // A nearest H1
  expect(buckets[1]).toContain(B) // B nearest H2 (dist 1 vs H1 dist 1 → tie broken by placeId, but B at lng2 equal; accept either)
  expect(buckets[0].concat(buckets[1], buckets[2])).toHaveLength(3)
})

it('clusterAttractionsToDays overflows only one day when over budget', () => {
  // budget 120, dwell 90 → 2nd home attraction overflows to next day
  const dayHotels = [H1, H2]
  const A2 = p('A2', 0, 0.1)
  const buckets = clusterAttractionsToDays([A, A2], dayHotels, 120, () => 90)
  // both home to day0 by proximity; one overflows to day1
  expect(buckets[0]).toHaveLength(1)
  expect(buckets[1]).toHaveLength(1)
})

it('routeDay ends at thisHotel and excludes prevHotel from output', () => {
  const seq = routeDay(H1, [B], H2)
  expect(seq[seq.length - 1]).toBe(H2)
  expect(seq).not.toContain(H1)
  expect(seq).toContain(B)
})

it('routeDay with no hotels just returns the attractions ordered', () => {
  expect(routeDay(null, [A], null)).toEqual([A])
})
