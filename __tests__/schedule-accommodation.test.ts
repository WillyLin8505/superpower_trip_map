import { schedulePlaces } from '@/app/actions/schedule'
import type { Place, DistanceMatrix } from '@/lib/types'

function p(name: string, lat: number, lng: number, type: Place['type'] = 'attraction'): Place {
  return { id: name, placeId: name, name, type, lat, lng, address: '', openingHours: null, rating: null, photoUrl: null, description: null }
}
// 退化距離矩陣（用 haversine fallback 在 schedule 內不需要；給空 indices 讓 travelSecs 回 0）
const emptyMatrix: DistanceMatrix = { indices: [], matrix: [] }

it('with accommodation, each non-last day ends at a hotel card', async () => {
  const places = [
    p('A', 0, 0), p('H1', 0, 1, 'accommodation'),
    p('B', 0, 2), p('H2', 0, 3, 'accommodation'),
  ]
  const days = await schedulePlaces(places, emptyMatrix, 3, '2026-06-28')
  expect(days).toHaveLength(3)
  // day1 last card is an accommodation; day2 last card is an accommodation
  expect(days[0].places[days[0].places.length - 1].type).toBe('accommodation')
  expect(days[1].places[days[1].places.length - 1].type).toBe('accommodation')
})

it('hotels get a 1-indexed nightIndex', async () => {
  const places = [p('A', 0, 0), p('H1', 0, 1, 'accommodation')]
  const days = await schedulePlaces(places, emptyMatrix, 2, '2026-06-28')
  const hotel = days.flatMap((d) => d.places).find((pl) => pl.type === 'accommodation')
  expect(hotel?.nightIndex).toBe(1)
})

it('without accommodation, falls back to count-based chunking (unchanged)', async () => {
  const places = [p('A', 0, 0), p('B', 0, 1), p('C', 0, 2), p('D', 0, 3)]
  const days = await schedulePlaces(places, emptyMatrix, 2, '2026-06-28')
  expect(days).toHaveLength(2)
  expect(days.flatMap((d) => d.places)).toHaveLength(4)
})
