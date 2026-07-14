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

  it('sends the mapped Google type for attractions', async () => {
    mockFetch({ status: 'OK', results: [] })
    await nearbySearch(25.0, 121.5, 'attraction')
    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('nearbysearch/json')
    expect(url).toContain('type=tourist_attraction')
  })
})
