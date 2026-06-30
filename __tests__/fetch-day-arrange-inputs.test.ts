import { fetchDayArrangeInputs } from '@/app/actions/arrange'
import type { Place } from '@/lib/types'

jest.mock('@/app/actions/directions', () => ({
  buildDistanceMatrix: jest.fn(async (places: Place[]) => ({
    indices: places.map((p) => p.placeId),
    matrix: places.map(() => places.map(() => 600)),
  })),
}))

const getCrowdForecast = jest.fn(async (p: Place) => ({
  source: 'heuristic' as const,
  weekly: Array.from({ length: 7 }, () => Array<number | null>(24).fill(0)),
  fetchedAt: '2026-07-01T00:00:00Z',
  venueId: p.placeId,
}))
jest.mock('@/lib/crowd', () => ({
  getCrowdForecast: (p: Place) => getCrowdForecast(p),
}))

function p(name: string): Place {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null }
}

beforeEach(() => { getCrowdForecast.mockClear() })

it('returns the distance matrix and skips crowd when needCrowd is false', async () => {
  const out = await fetchDayArrangeInputs([p('A'), p('B')], 'driving', false)
  expect(out.indices).toEqual(['A', 'B'])
  expect(out.matrix).toEqual([[600, 600], [600, 600]])
  expect(out.crowdByPlaceId).toEqual({})
  expect(getCrowdForecast).not.toHaveBeenCalled()
})

it('fetches a crowd forecast per place when needCrowd is true', async () => {
  const out = await fetchDayArrangeInputs([p('A'), p('B')], 'driving', true)
  expect(Object.keys(out.crowdByPlaceId).sort()).toEqual(['A', 'B'])
  expect(getCrowdForecast).toHaveBeenCalledTimes(2)
})
