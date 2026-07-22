import { getPlaceDetails, searchPlaceEssentials } from '@/app/actions/places'

describe('getPlaceDetails', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
  })

  it('maps up to five Google details photos while preserving photoUrl compatibility', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        status: 'OK',
        result: {
          place_id: 'place-1',
          name: 'Avoccino',
          geometry: { location: { lat: 21.03, lng: 105.84 } },
          formatted_address: 'Hanoi',
          opening_hours: { weekday_text: ['Monday: 7:00 AM – 11:00 PM'] },
          rating: 4.9,
          photos: [
            { photo_reference: 'detail-ref-1' },
            { photo_reference: 'detail-ref-2' },
            { photo_reference: 'detail-ref-3' },
            { photo_reference: 'detail-ref-4' },
            { photo_reference: 'detail-ref-5' },
            { photo_reference: 'detail-ref-6' },
          ],
          editorial_summary: { overview: 'Coffee shop' },
        },
      }),
    }) as unknown as typeof fetch

    const place = await getPlaceDetails('place-1')

    expect(place?.photoUrl).toBe('/api/photo?ref=detail-ref-1')
    expect(place?.photoUrls).toEqual([
      '/api/photo?ref=detail-ref-1',
      '/api/photo?ref=detail-ref-2',
      '/api/photo?ref=detail-ref-3',
      '/api/photo?ref=detail-ref-4',
      '/api/photo?ref=detail-ref-5',
    ])
  })

  it('searchPlaceEssentials resolves coordinates without requesting Pro fields', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'place-1' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          result: {
            place_id: 'place-1',
            name: '大阪城',
            geometry: { location: { lat: 34.6873, lng: 135.5262 } },
            formatted_address: '日本、大阪府大阪市',
            types: ['tourist_attraction'],
          },
        }),
      }) as unknown as typeof fetch

    const place = await searchPlaceEssentials('大阪城', 'Japan')

    expect(place).toEqual(expect.objectContaining({
      placeId: 'place-1',
      name: '大阪城',
      lat: 34.6873,
      lng: 135.5262,
      openingHours: null,
      rating: null,
      photoUrl: null,
      photoUrls: [],
    }))
    const detailsUrl = (global.fetch as jest.Mock).mock.calls[1][0] as string
    expect(detailsUrl).toContain('fields=place_id%2Cname%2Cgeometry%2Cformatted_address%2Ctype')
    expect(detailsUrl).not.toContain('opening_hours')
    expect(detailsUrl).not.toContain('rating')
    expect(detailsUrl).not.toContain('photos')
  })
})
