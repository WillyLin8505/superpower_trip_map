const findPlaceResponse = { candidates: [{ place_id: 'ChIJx' }] }
const detailsResponse = {
  status: 'OK',
  result: {
    place_id: 'ChIJx', name: '度小月',
    geometry: { location: { lat: 22.99, lng: 120.2 } },
    formatted_address: '台南市中西區', types: ['restaurant', 'food'],
  },
}

const trackedApiFetch = jest.fn()
jest.mock('@/lib/apiUsageEvents', () => ({ trackedApiFetch: (...a: unknown[]) => trackedApiFetch(...a) }))
jest.mock('@/lib/googleMapsCost', () => ({ googleMapsFetchOptions: () => ({}), roundedCoordinate: (n: number) => n }))
const readCachedPlaceId = jest.fn()
const writeCachedPlaceId = jest.fn()
jest.mock('@/lib/placeIdCache', () => ({
  readCachedPlaceId: (...a: unknown[]) => readCachedPlaceId(...a),
  writeCachedPlaceId: (...a: unknown[]) => writeCachedPlaceId(...a),
}))

import { resolvePlaceEssentials } from '@/app/actions/savedPlacesResolve'

beforeEach(() => {
  jest.clearAllMocks()
  readCachedPlaceId.mockResolvedValue(null)
  trackedApiFetch
    .mockResolvedValueOnce({ json: async () => findPlaceResponse })  // find place (free id)
    .mockResolvedValueOnce({ json: async () => detailsResponse })    // details essentials
})

it('resolves title to a typed stub via find-place + essentials details', async () => {
  const stub = await resolvePlaceEssentials('度小月', { lat: 22.99, lng: 120.2 })
  expect(stub).toEqual({
    placeId: 'ChIJx', name: '度小月', type: 'restaurant',
    lat: 22.99, lng: 120.2, address: '台南市中西區',
  })
})

it('requests the exact Basic field mask (type, singular; no photos/hours/rating/editorial) and tags the essentials SKU', async () => {
  await resolvePlaceEssentials('度小月')
  const detailsUrl = new URL(trackedApiFetch.mock.calls[1][0] as string)
  expect(detailsUrl.searchParams.get('fields')).toBe('place_id,name,geometry,formatted_address,type')
  expect(trackedApiFetch.mock.calls[1][2]).toMatchObject({ skuHint: 'place_details_essentials' })
})

it('reuses a cached place_id without calling find-place and without re-caching', async () => {
  readCachedPlaceId.mockResolvedValue('ChIJcached')
  trackedApiFetch.mockReset().mockResolvedValueOnce({
    json: async () => ({ ...detailsResponse, result: { ...detailsResponse.result, place_id: 'ChIJcached' } }),
  })
  const stub = await resolvePlaceEssentials('度小月')
  expect(stub?.placeId).toBe('ChIJcached')
  expect(trackedApiFetch).toHaveBeenCalledTimes(1) // details only, no find-place
  expect(writeCachedPlaceId).not.toHaveBeenCalled()
})

it('returns null when find-place yields no candidate', async () => {
  trackedApiFetch.mockReset().mockResolvedValueOnce({ json: async () => ({ candidates: [] }) })
  expect(await resolvePlaceEssentials('查無此地')).toBeNull()
})

it('caches title→place_id only after Details succeeds', async () => {
  await resolvePlaceEssentials('度小月')
  expect(writeCachedPlaceId).toHaveBeenCalledWith('度小月', undefined, 'ChIJx')
})

it('namespaces the place_id cache by a coarse coord bucket when coords are given', async () => {
  await resolvePlaceEssentials('Starbucks', { lat: 25.03, lng: 121.56 })
  expect(readCachedPlaceId).toHaveBeenCalledWith('Starbucks', '25.0,121.6')
  expect(writeCachedPlaceId).toHaveBeenCalledWith('Starbucks', '25.0,121.6', 'ChIJx')
})

it('does NOT cache when Details is non-OK or lacks geometry (no cache poisoning)', async () => {
  trackedApiFetch.mockReset()
    .mockResolvedValueOnce({ json: async () => findPlaceResponse })
    .mockResolvedValueOnce({ json: async () => ({ status: 'NOT_FOUND' }) })
  expect(await resolvePlaceEssentials('度小月')).toBeNull()
  expect(writeCachedPlaceId).not.toHaveBeenCalled()
})
