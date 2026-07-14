import { nearbySearch } from '@/app/actions/places'

describe('nearbySearch attraction fallback', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
  })

  it('falls back to a sightseeing keyword query when tourist_attraction returns no results', async () => {
    // Regression: attraction recommendations could show 0 because the typed Google Nearby query was too narrow.
    // Found by /qa on 2026-07-15.
    // Report: .gstack/qa-reports/qa-report-attraction-recommendations-2026-07-15.md
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        json: async () => ({ status: 'ZERO_RESULTS', results: [] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          results: Array.from({ length: 5 }, (_, i) => ({
            place_id: `attraction-${i}`,
            name: `Local Landmark ${i}`,
            geometry: { location: { lat: 21 + i * 0.001, lng: 105 + i * 0.001 } },
            vicinity: 'Hanoi',
            types: ['tourist_attraction', 'point_of_interest', 'establishment'],
          })),
        }),
      }) as unknown as typeof fetch

    const out = await nearbySearch(21.0287, 105.852, 'attraction')

    expect(out).toHaveLength(5)
    expect(out.every((place) => place.description === '景點／拍照散步')).toBe(true)
    const calls = (global.fetch as jest.Mock).mock.calls.map(([url]) => new URL(url as string))
    expect(calls[0].searchParams.get('type')).toBe('tourist_attraction')
    expect(calls[1].searchParams.get('keyword')).toContain('sightseeing')
  })
})
