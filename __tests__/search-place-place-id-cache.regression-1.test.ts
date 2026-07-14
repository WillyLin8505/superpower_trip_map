const mockReadCachedPlaceId = jest.fn()
const mockWriteCachedPlaceId = jest.fn()

jest.mock('@/lib/placeIdCache', () => ({
  readCachedPlaceId: (...args: unknown[]) => mockReadCachedPlaceId(...args),
  writeCachedPlaceId: (...args: unknown[]) => mockWriteCachedPlaceId(...args),
}))

import { searchPlace } from '@/app/actions/places'

const fetchMock = jest.fn()
global.fetch = fetchMock

function detailsResponse(placeIdName = '淺草寺') {
  return {
    status: 'OK',
    result: {
      name: placeIdName,
      geometry: { location: { lat: 35.7147, lng: 139.7966 } },
      formatted_address: '東京都台東区',
      opening_hours: null,
      rating: 4.5,
      photos: null,
      editorial_summary: null,
    },
  }
}

describe('searchPlace place_id cache', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    mockReadCachedPlaceId.mockReset()
    mockWriteCachedPlaceId.mockReset()
  })

  it('uses cached place_id and skips Find Place API', async () => {
    mockReadCachedPlaceId.mockResolvedValue('cached-place-id')
    fetchMock.mockResolvedValueOnce({ json: async () => detailsResponse() })

    const result = await searchPlace('淺草寺', 'Japan')

    expect(result?.placeId).toBe('cached-place-id')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('details/json')
    expect(fetchMock.mock.calls[0][0]).toContain('place_id=cached-place-id')
    expect(fetchMock.mock.calls[0][0]).not.toContain('findplacefromtext')
    expect(mockWriteCachedPlaceId).not.toHaveBeenCalled()
  })

  it('falls back to Find Place and refreshes cache when cached place_id is stale', async () => {
    mockReadCachedPlaceId.mockResolvedValue('stale-place-id')
    fetchMock
      .mockResolvedValueOnce({ json: async () => ({ status: 'NOT_FOUND' }) })
      .mockResolvedValueOnce({ json: async () => ({ candidates: [{ place_id: 'fresh-place-id' }] }) })
      .mockResolvedValueOnce({ json: async () => detailsResponse('新淺草寺') })

    const result = await searchPlace('淺草寺', 'Japan')

    expect(result?.placeId).toBe('fresh-place-id')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][0]).toContain('place_id=stale-place-id')
    expect(fetchMock.mock.calls[1][0]).toContain('findplacefromtext')
    expect(fetchMock.mock.calls[2][0]).toContain('place_id=fresh-place-id')
    expect(mockWriteCachedPlaceId).toHaveBeenCalledWith('淺草寺', 'Japan', 'fresh-place-id')
  })
})
