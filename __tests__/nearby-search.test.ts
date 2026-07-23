import { nearbySearch } from '@/app/actions/places'

describe('nearbySearch', () => {
  const realFetch = global.fetch
  afterEach(() => { global.fetch = realFetch })

  function mockFetch(payload: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => payload,
    }) as unknown as typeof fetch
  }

  it('maps Google nearby results to Place[] with the requested type', async () => {
    mockFetch({
      status: 'OK',
      results: [
        {
          place_id: 'p1', name: '某甜點店',
          geometry: { location: { lat: 25.01, lng: 121.51 } },
          vicinity: '台北市', rating: 4.6,
          photos: [{ photo_reference: 'ref1' }],
        },
      ],
    })
    const out = await nearbySearch(25.0, 121.5, 'dessert')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      placeId: 'p1', name: '某甜點店', type: 'dessert',
      lat: 25.01, lng: 121.51, rating: 4.6,
      photoUrl: '/api/photo?ref=ref1', openingHours: null, description: '甜點／飲料店',
    })
  })

  it('returns [] when status is not OK', async () => {
    mockFetch({ status: 'ZERO_RESULTS', results: [] })
    expect(await nearbySearch(25.0, 121.5, 'restaurant')).toEqual([])
  })

  it('maps Google review count and raw category tags for ranking', async () => {
    mockFetch({
      status: 'OK',
      results: [
        {
          place_id: 'p1',
          name: 'Ann Dessert',
          geometry: { location: { lat: 25.01, lng: 121.51 } },
          vicinity: 'Taipei',
          rating: 4.6,
          user_ratings_total: 1234,
          types: ['bakery', 'cafe', 'food'],
          photos: [{ photo_reference: 'ref1' }],
        },
      ],
    })

    const out = await nearbySearch(25.0, 121.5, 'dessert')

    expect(out[0]).toMatchObject({
      placeId: 'p1',
      reviewCount: 1234,
      categoryTags: ['bakery', 'cafe', 'food'],
    })
  })

  it('maps up to five Google photos while preserving photoUrl compatibility', async () => {
    mockFetch({
      status: 'OK',
      results: [
        {
          place_id: 'p1',
          name: 'Avoccino',
          geometry: { location: { lat: 25.01, lng: 121.51 } },
          vicinity: 'Hanoi',
          rating: 4.6,
          photos: [
            { photo_reference: 'ref1' },
            { photo_reference: 'ref2' },
            { photo_reference: 'ref3' },
            { photo_reference: 'ref4' },
            { photo_reference: 'ref5' },
            { photo_reference: 'ref6' },
          ],
        },
      ],
    })

    const out = await nearbySearch(25.0, 121.5, 'dessert')

    expect(out[0].photoUrl).toBe('/api/photo?ref=ref1')
    expect(out[0].photoUrls).toEqual([
      '/api/photo?ref=ref1',
      '/api/photo?ref=ref2',
      '/api/photo?ref=ref3',
      '/api/photo?ref=ref4',
      '/api/photo?ref=ref5',
    ])
  })

  it('returns up to twenty place candidates so trip-wide dedupe can still fill later days', async () => {
    mockFetch({
      status: 'OK',
      results: Array.from({ length: 25 }, (_, i) => ({
        place_id: `p${i}`,
        name: `Dessert ${i}`,
        geometry: { location: { lat: 25.01 + i * 0.001, lng: 121.51 } },
        vicinity: 'Taipei',
        rating: 4.6,
        user_ratings_total: 100 + i,
        types: ['bakery', 'cafe', 'food'],
      })),
    })

    const out = await nearbySearch(25.0, 121.5, 'dessert')

    expect(out).toHaveLength(20)
    expect(out.map((place) => place.placeId)).toEqual(Array.from({ length: 20 }, (_, i) => `p${i}`))
  })

  it('tries a wider dessert query when the first nearby query has no results', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          results: [
            {
              place_id: 'wide-dessert',
              name: 'Wide Dessert',
              geometry: { location: { lat: 25.02, lng: 121.52 } },
              vicinity: 'Taipei',
              types: ['bakery', 'food'],
            },
          ],
        }),
      }) as unknown as typeof fetch

    const out = await nearbySearch(25.0, 121.5, 'dessert')

    expect(out.map((place) => place.placeId)).toEqual(['wide-dessert'])
    const calls = (global.fetch as jest.Mock).mock.calls.map(([url]) => new URL(url as string))
    expect(calls[0].searchParams.get('radius')).toBe('4000')
    expect(calls[1].searchParams.get('radius')).toBe('12000')
    expect(calls[1].searchParams.get('keyword')).toContain('patisserie')
  })

  it('sends the mapped Google type for attractions', async () => {
    mockFetch({ status: 'OK', results: [] })
    await nearbySearch(25.0, 121.5, 'attraction')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('nearbysearch/json')
    expect(url).toContain('type=tourist_attraction')
  })
})
