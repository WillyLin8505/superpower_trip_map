import { searchPlace } from '@/app/actions/places'

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
})
