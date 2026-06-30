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
      photoUrl: '/api/photo?ref=ref1', openingHours: null, description: null,
    })
  })

  it('returns [] when status is not OK', async () => {
    mockFetch({ status: 'ZERO_RESULTS', results: [] })
    expect(await nearbySearch(25.0, 121.5, 'restaurant')).toEqual([])
  })

  it('sends the mapped Google type for attractions', async () => {
    mockFetch({ status: 'OK', results: [] })
    await nearbySearch(25.0, 121.5, 'attraction')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('nearbysearch/json')
    expect(url).toContain('type=tourist_attraction')
  })
})
