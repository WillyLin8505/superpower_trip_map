import { searchPlace, verifyPlace } from '@/app/actions/places'

const mockFetch = jest.fn()
global.fetch = mockFetch

const PLACE_DETAILS_RESPONSE = {
  status: 'OK',
  result: {
    name: '淺草寺',
    geometry: { location: { lat: 35.7147, lng: 139.7966 } },
    formatted_address: '東京都台東区浅草',
    opening_hours: null,
    rating: 4.5,
    photos: null,
    editorial_summary: null,
  },
}

describe('searchPlace with country', () => {
  beforeEach(() => jest.clearAllMocks())

  it('appends country name to query when countryName provided', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'place123' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => PLACE_DETAILS_RESPONSE,
      })

    await searchPlace('淺草寺', 'Japan')

    const findPlaceCall = mockFetch.mock.calls[0][0] as string
    expect(findPlaceCall).toContain(encodeURIComponent('淺草寺, Japan'))
  })

  it('does not append anything when countryName is omitted', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'place123' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => PLACE_DETAILS_RESPONSE,
      })

    await searchPlace('淺草寺')

    const findPlaceCall = mockFetch.mock.calls[0][0] as string
    expect(findPlaceCall).toContain(encodeURIComponent('淺草寺'))
    expect(findPlaceCall).not.toContain('Japan')
  })

  it('returns null when no candidates found', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ candidates: [] }),
    })

    const result = await searchPlace('不存在的地方', 'Taiwan')
    expect(result).toBeNull()
  })

  it('returns localized fields from the single zh-TW details response', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'place123' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => PLACE_DETAILS_RESPONSE,
      })

    const result = await searchPlace('淺草寺', 'Japan')

    expect(result).toEqual(expect.objectContaining({
      name: '淺草寺',
      localizedName: { zhTw: '淺草寺', original: '淺草寺' },
      address: '東京都台東区浅草',
      localizedAddress: { zhTw: '東京都台東区浅草', original: '東京都台東区浅草' },
    }))
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect((mockFetch.mock.calls[1][0] as string)).toContain('language=zh-TW')
    expect((mockFetch.mock.calls[1][0] as string)).not.toContain('language=en')
  })

  it('verifyPlace preserves localized fields from searchPlace', async () => {
    mockFetch
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'place123' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => PLACE_DETAILS_RESPONSE,
      })

    const result = await verifyPlace('淺草寺')

    expect(result).toEqual(expect.objectContaining({
      placeId: 'place123',
      localizedName: { zhTw: '淺草寺', original: '淺草寺' },
      localizedAddress: { zhTw: '東京都台東区浅草', original: '東京都台東区浅草' },
    }))
  })
})
