import { buildApiUsageEventRow, redactGoogleMapsApiKey } from '@/lib/apiUsageEvents'

it('builds an API usage event row with estimated Google Maps cost', () => {
  expect(buildApiUsageEventRow({
    provider: 'google_maps',
    endpoint: 'nearby_search',
    skuHint: 'nearby_search_pro',
    units: 2,
    statusCode: 200,
    requestHashSource: 'https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=1,2&key=secret',
  }, new Date('2026-07-14T00:00:00.000Z'))).toMatchObject({
    provider: 'google_maps',
    endpoint: 'nearby_search',
    sku_hint: 'nearby_search_pro',
    units: 2,
    status_code: 200,
    cache_hit: false,
    estimated_cost_usd: 0.064,
    created_at: '2026-07-14T00:00:00.000Z',
  })
})

it('redacts Google Maps API keys before hashing or logging URLs', () => {
  expect(redactGoogleMapsApiKey('https://maps.googleapis.com/maps/api/place/details/json?place_id=p1&key=secret')).toBe(
    'https://maps.googleapis.com/maps/api/place/details/json?place_id=p1&key=REDACTED'
  )
})
