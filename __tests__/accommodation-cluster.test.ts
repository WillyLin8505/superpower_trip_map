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

it('spreads attractions across all days when one hotel serves a multi-day trip (regression)', () => {
  // Single hotel for a 6-day trip: previously all attractions collapsed onto days 1-2
  // (e.g. [8,16,0,0,0,0]) and the 16-place day exceeded the embed map's waypoint limit.
  const hotel = p('H', 25.05, 121.55, 'accommodation')
  const attractions = Array.from({ length: 24 }, (_, i) =>
    p(`A${i}`, 25.05 + (i % 5) * 0.01, 121.55 + Math.floor(i / 5) * 0.01)
  )
  const dayHotels = assignHotelsToDays([hotel], 6)
  const buckets = clusterAttractionsToDays(attractions, dayHotels, 720, () => 90)
  const counts = buckets.map((b) => b.length)
  // Every day gets attractions; none is empty and none is crammed.
  expect(counts.every((c) => c > 0)).toBe(true)
  // No day exceeds the embed map limit (origin + 9 waypoints + destination = 11 places,
  // and each day also carries its hotel), so the map renders on every day.
  expect(counts.every((c, i) => c + (dayHotels[i] ? 1 : 0) <= 11)).toBe(true)
  // All attractions are placed exactly once.
  expect(counts.reduce((s, c) => s + c, 0)).toBe(24)
})

it('does not collapse when attractions are fewer than days (perDayTarget floor)', () => {
  // Codex P1 edge: attractions.length (3) < days (6) → perDayTarget floors to 1.
  // buckets hold ONLY attractions (hotels are attached later in routeDay), so the
  // hotel never consumes attraction capacity and the 3 attractions still spread out.
  const hotel = p('H', 25.05, 121.55, 'accommodation')
  const attractions = [p('A0', 25.05, 121.55), p('A1', 25.06, 121.56), p('A2', 25.07, 121.57)]
  const dayHotels = assignHotelsToDays([hotel], 6)
  const buckets = clusterAttractionsToDays(attractions, dayHotels, 720, () => 90)
  const counts = buckets.map((b) => b.length)
  expect(counts.filter((c) => c > 0)).toHaveLength(3) // spread across 3 days, one each
  expect(counts.every((c) => c <= 1)).toBe(true)
  expect(counts.reduce((s, c) => s + c, 0)).toBe(3)
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
