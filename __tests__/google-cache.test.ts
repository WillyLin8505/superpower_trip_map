// Faithful in-memory stand-in for the Next Data Cache: caches a fetcher's
// resolved value by its key array, and does NOT cache when the fetcher throws
// (matching unstable_cache semantics that cachedGoogle relies on).
const cacheStore = new Map<string, unknown>()
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, keys: string[]) =>
    async (...args: unknown[]) => {
      const k = JSON.stringify(keys)
      if (cacheStore.has(k)) return cacheStore.get(k)
      const v = await fn(...args)
      cacheStore.set(k, v)
      return v
    },
}))

const mockTracked = jest.fn()
jest.mock('@/lib/apiUsageEvents', () => ({
  trackedApiFetch: (...args: unknown[]) => mockTracked(...args),
}))

import { cachedGoogle } from '@/lib/googleCache'
import { nearbySearch, getPlaceDetails } from '@/app/actions/places'

beforeEach(() => {
  cacheStore.clear()
  mockTracked.mockReset()
  mockTracked.mockResolvedValue({
    json: async () => ({
      status: 'OK',
      results: [{ place_id: 'p1', name: '某餐廳', geometry: { location: { lat: 25, lng: 121 } } }],
    }),
  })
})

describe('cachedGoogle', () => {
  it('runs the fetcher once and serves repeats from cache (same key)', async () => {
    const fetcher = jest.fn(async () => 'r1')
    const a = await cachedGoogle(['k', '1'], fetcher)
    const b = await cachedGoogle(['k', '1'], fetcher)
    expect([a, b]).toEqual(['r1', 'r1'])
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('keys different inputs separately', async () => {
    const f1 = jest.fn(async () => 'a')
    const f2 = jest.fn(async () => 'b')
    await cachedGoogle(['k', '1'], f1)
    await cachedGoogle(['k', '2'], f2)
    expect(f1).toHaveBeenCalledTimes(1)
    expect(f2).toHaveBeenCalledTimes(1)
  })

  it('does not cache a thrown failure (so it can be retried)', async () => {
    const fetcher = jest.fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok')
    await expect(cachedGoogle(['k', '3'], fetcher)).rejects.toThrow('transient')
    await expect(cachedGoogle(['k', '3'], fetcher)).resolves.toBe('ok')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('nearbySearch caching', () => {
  it('serves identical (rounded coords + type) searches from cache — no repeat Google call', async () => {
    await nearbySearch(25.0330, 121.5654, 'restaurant')
    const googleCallsAfterFirst = mockTracked.mock.calls.length
    expect(googleCallsAfterFirst).toBeGreaterThan(0)

    await nearbySearch(25.0330, 121.5654, 'restaurant')
    expect(mockTracked.mock.calls.length).toBe(googleCallsAfterFirst) // 0 new Google calls
  })

  it('a different category is a separate cache entry (does call Google)', async () => {
    await nearbySearch(25.0330, 121.5654, 'restaurant')
    const afterRestaurant = mockTracked.mock.calls.length
    await nearbySearch(25.0330, 121.5654, 'dessert')
    expect(mockTracked.mock.calls.length).toBeGreaterThan(afterRestaurant)
  })

  it('throws on a transient Google status and does NOT poison the cache', async () => {
    mockTracked.mockResolvedValueOnce({ json: async () => ({ status: 'OVER_QUERY_LIMIT' }) })
    await expect(nearbySearch(25.0330, 121.5654, 'restaurant')).rejects.toThrow(/OVER_QUERY_LIMIT/)
    // next call is not served from a poisoned cache — it retries Google and succeeds
    const out = await nearbySearch(25.0330, 121.5654, 'restaurant')
    expect(out.length).toBeGreaterThan(0)
  })

  it('caches a deterministic empty area (ZERO_RESULTS) without re-calling Google', async () => {
    mockTracked.mockResolvedValue({ json: async () => ({ status: 'ZERO_RESULTS' }) })
    const first = await nearbySearch(30, 40, 'dessert')
    expect(first).toEqual([])
    const calls = mockTracked.mock.calls.length
    const second = await nearbySearch(30, 40, 'dessert')
    expect(second).toEqual([])
    expect(mockTracked.mock.calls.length).toBe(calls)
  })
})

describe('getPlaceDetails caching', () => {
  beforeEach(() => {
    mockTracked.mockResolvedValue({
      json: async () => ({
        status: 'OK',
        result: { name: '鼎泰豐', formatted_address: '台北市信義區', geometry: { location: { lat: 25, lng: 121 } }, photos: [], rating: 4.5 },
      }),
    })
  })

  it('caches by (placeId, name hint): a repeat call makes no new Google request', async () => {
    await getPlaceDetails('pid-1', '鼎泰豐')
    const afterFirst = mockTracked.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)
    await getPlaceDetails('pid-1', '鼎泰豐')
    expect(mockTracked.mock.calls.length).toBe(afterFirst)
  })

  it('throws on a transient status and does not cache it (retry succeeds)', async () => {
    mockTracked.mockResolvedValueOnce({ json: async () => ({ status: 'OVER_QUERY_LIMIT' }) })
    await expect(getPlaceDetails('pid-2', 'x')).rejects.toThrow(/OVER_QUERY_LIMIT/)
    const place = await getPlaceDetails('pid-2', 'x')
    expect(place?.name).toBe('鼎泰豐')
  })
})
