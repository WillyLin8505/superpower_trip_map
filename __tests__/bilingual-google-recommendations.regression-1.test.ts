import { getPlaceDetails, nearbySearch } from '@/app/actions/places'

describe('bilingual Google recommendation names regression', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
  })

  it('uses a latinized English fallback as primary and keeps Vietnamese as secondary from details', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          result: {
            name: 'VOU Cafe - Tổng Dân',
            geometry: { location: { lat: 21.0278, lng: 105.8342 } },
            formatted_address: 'Hà Nội',
            opening_hours: null,
            rating: 4.7,
            photos: null,
            editorial_summary: null,
          },
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          result: {
            name: 'VOU Cafe - Tổng Dân',
            geometry: { location: { lat: 21.0278, lng: 105.8342 } },
            formatted_address: 'Hanoi',
            opening_hours: null,
            rating: 4.7,
            photos: null,
            editorial_summary: null,
          },
        }),
      })
    global.fetch = fetchMock as unknown as typeof fetch

    const place = await getPlaceDetails('vou-cafe')

    expect(place).toEqual(expect.objectContaining({
      name: 'VOU Cafe - Tong Dan',
      localizedName: {
        zhTw: null,
        en: 'VOU Cafe - Tong Dan',
        original: 'VOU Cafe - Tổng Dân',
      },
    }))
  })

  it('adds bilingual fallback fields to nearby Google recommendation candidates', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 'OK',
        results: [
          {
            place_id: 'vou-cafe',
            name: 'VOU Cafe - Tổng Dân',
            geometry: { location: { lat: 21.0278, lng: 105.8342 } },
            vicinity: 'Hà Nội',
            rating: 4.7,
            photos: [{ photo_reference: 'photo-1' }],
          },
        ],
      }),
    }) as unknown as typeof fetch

    const places = await nearbySearch(21.0278, 105.8342, 'dessert')

    expect(places[0]).toEqual(expect.objectContaining({
      name: 'VOU Cafe - Tong Dan',
      localizedName: {
        zhTw: null,
        en: 'VOU Cafe - Tong Dan',
        original: 'VOU Cafe - Tổng Dân',
      },
      photoUrl: '/api/photo?ref=photo-1',
    }))
  })
})
