import { nearbySearch } from '@/app/actions/places'

describe('nearbySearch recommendation regressions', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
  })

  function mockFetch(payload: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => payload,
    }) as unknown as typeof fetch
  }

  it('adds concise place explanations from Google place types', async () => {
    // Regression: ISSUE-001 - recommendation cards lacked short descriptions such as cake shop or drink shop.
    // Found by /qa on 2026-07-14.
    // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
    mockFetch({
      status: 'OK',
      results: [
        {
          place_id: 'p1',
          name: 'Ann Dessert',
          geometry: { location: { lat: 25.01, lng: 121.51 } },
          vicinity: 'Taipei',
          rating: 4.6,
          types: ['bakery', 'cafe', 'food'],
          photos: [{ photo_reference: 'ref1' }],
        },
      ],
    })

    const out = await nearbySearch(25.0, 121.5, 'dessert')

    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      placeId: 'p1',
      type: 'dessert',
      description: '蛋糕店／咖啡廳',
    })
  })

  it('asks Google for local lunch and dinner restaurant intent', async () => {
    // Regression: ISSUE-004 - restaurant recommendations could drift into non-meal places.
    // Found by /qa on 2026-07-14.
    // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
    mockFetch({ status: 'OK', results: [] })

    await nearbySearch(25.0, 121.5, 'restaurant')

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string
    expect(url).toContain('type=restaurant')
    expect(new URL(url).searchParams.get('keyword')).toContain('local lunch dinner')
  })

  it('filters hotel-like restaurant results and keeps five food places', async () => {
    // Regression: ISSUE-003 - hotel results displaced the five local restaurant recommendations.
    // Found by /qa on 2026-07-14.
    // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
    mockFetch({
      status: 'OK',
      results: [
        { place_id: 'h1', name: 'Hotel du Parc HaNoi', geometry: { location: { lat: 1, lng: 1 } }, types: ['lodging', 'restaurant'] },
        { place_id: 'h2', name: 'Hanoi Tirant Hotel', geometry: { location: { lat: 1, lng: 1 } }, types: ['restaurant'] },
        ...Array.from({ length: 5 }, (_, i) => ({
          place_id: `r${i}`,
          name: `Local Lunch ${i}`,
          geometry: { location: { lat: 1, lng: 1 } },
          types: ['restaurant', 'food'],
        })),
      ],
    })

    const out = await nearbySearch(25.0, 121.5, 'restaurant')

    expect(out).toHaveLength(5)
    expect(out.map((place) => place.name)).not.toContain('Hotel du Parc HaNoi')
    expect(out.map((place) => place.name)).not.toContain('Hanoi Tirant Hotel')
    expect(out.every((place) => place.description === '當地午餐／晚餐')).toBe(true)
  })
})
