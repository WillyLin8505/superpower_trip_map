// __tests__/crowd-index.test.ts
import { getCrowdForecast } from '@/lib/crowd'
import { InMemoryCrowdCache } from '@/lib/crowd/cache'
import type { Place } from '@/lib/types'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function place(over: Partial<Place> = {}): Place {
  return {
    id: 'id', placeId: 'pid', name: 'X', type: 'restaurant',
    lat: 0, lng: 0, address: 'addr', openingHours: null, rating: 4,
    photoUrl: null, description: null, ...over,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.BESTTIME_PRIVATE_KEY
})

test('no key → falls back to heuristic', async () => {
  const f = await getCrowdForecast(place(), new InMemoryCrowdCache())
  expect(f.source).toBe('heuristic')
  expect(mockFetch).not.toHaveBeenCalled()
})

test('key + OK response → besttime source', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK',
      venue_info: { venue_id: 'v' },
      analysis: [{ day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, () => 42), hour_analysis: [] }],
    }),
  })
  const f = await getCrowdForecast(place(), new InMemoryCrowdCache())
  expect(f.source).toBe('besttime')
  expect(f.weekly[0][10]).toBe(42)
})

test('besttime null → falls back to heuristic', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({ json: async () => ({ status: 'Error' }) })
  const f = await getCrowdForecast(place(), new InMemoryCrowdCache())
  expect(f.source).toBe('heuristic')
})

test('second call hits cache (no second fetch)', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK', venue_info: { venue_id: 'v' },
      analysis: [{ day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, () => 42), hour_analysis: [] }],
    }),
  })
  const cache = new InMemoryCrowdCache()
  const p = place()
  await getCrowdForecast(p, cache)
  await getCrowdForecast(p, cache)
  expect(mockFetch).toHaveBeenCalledTimes(1)
})
