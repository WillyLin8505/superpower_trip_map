import { schedulePlaces } from '@/app/actions/schedule'
import type { Place, DistanceMatrix } from '@/lib/types'

const makePlaces = (types: ('attraction' | 'restaurant')[]): Place[] =>
  types.map((type, i) => ({
    id: `${i}`,
    placeId: `pid${i}`,
    name: `Place ${i}`,
    type,
    lat: 25 + i * 0.01,
    lng: 121.5,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    ticketPrice: null,
  }))

const zeroMatrix = (n: number): DistanceMatrix => ({
  indices: Array.from({ length: n }, (_, i) => `pid${i}`),
  matrix: Array.from({ length: n }, () => Array(n).fill(0)),
})

test('returns correct number of days', async () => {
  const places = makePlaces(['attraction', 'restaurant', 'attraction', 'restaurant'])
  const result = await schedulePlaces(places, zeroMatrix(4), 2)
  expect(result).toHaveLength(2)
})

test('each day has places assigned', async () => {
  const places = makePlaces(['attraction', 'restaurant', 'attraction'])
  const result = await schedulePlaces(places, zeroMatrix(3), 1)
  expect(result[0].places.length).toBeGreaterThan(0)
})

test('restaurants have startTime in meal windows', async () => {
  const places = makePlaces(['restaurant'])
  const result = await schedulePlaces(places, zeroMatrix(1), 1)
  const r = result[0].places.find((p) => p.type === 'restaurant')!
  const hour = parseInt(r.startTime.split(':')[0], 10)
  expect([12, 18, 19]).toContain(hour)
})
