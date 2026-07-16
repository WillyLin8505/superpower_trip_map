// Caching stand-in for the Data Cache so the per-cell dedup is exercised.
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

const mockFetchOverpass = jest.fn()
jest.mock('@/lib/overpass', () => ({
  fetchOverpassPois: (...args: unknown[]) => mockFetchOverpass(...args),
}))

const upsert = jest.fn()
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ upsert: (...args: unknown[]) => upsert(...args) }) }),
}))

import { ensurePoiBackfill } from '@/lib/poiBackfill'

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
})

beforeEach(() => {
  cacheStore.clear()
  mockFetchOverpass.mockReset()
  upsert.mockReset()
  upsert.mockResolvedValue({ error: null })
})

test('fetches OSM POIs and upserts them into poi_places (ODbL, correct conflict key)', async () => {
  mockFetchOverpass.mockResolvedValue([
    { source: 'osm', source_place_id: 'node/1', name_primary: 'A', lat: 25, lng: 121, category: 'restaurant' },
  ])
  await ensurePoiBackfill(25.033, 121.565, 'restaurant')
  expect(mockFetchOverpass).toHaveBeenCalledTimes(1)
  expect(upsert).toHaveBeenCalledTimes(1)
  const [payload, opts] = upsert.mock.calls[0]
  expect(payload[0]).toMatchObject({ source_place_id: 'node/1', license: 'ODbL' })
  expect(opts).toMatchObject({ onConflict: 'source,source_place_id,category' })
})

test('dedups per cell — a second call for the same area does not re-query Overpass', async () => {
  mockFetchOverpass.mockResolvedValue([])
  await ensurePoiBackfill(25.033, 121.565, 'restaurant')
  await ensurePoiBackfill(25.033, 121.565, 'restaurant')
  expect(mockFetchOverpass).toHaveBeenCalledTimes(1)
})

test('does not upsert when Overpass returns no POIs', async () => {
  mockFetchOverpass.mockResolvedValue([])
  await ensurePoiBackfill(10, 20, 'attraction')
  expect(upsert).not.toHaveBeenCalled()
})

test('swallows an Overpass failure (no throw) and does not cache it (retries)', async () => {
  mockFetchOverpass.mockRejectedValueOnce(new Error('overpass_429'))
  await expect(ensurePoiBackfill(30, 40, 'dessert')).resolves.toBeUndefined()
  mockFetchOverpass.mockResolvedValueOnce([])
  await ensurePoiBackfill(30, 40, 'dessert')
  expect(mockFetchOverpass).toHaveBeenCalledTimes(2)
})
