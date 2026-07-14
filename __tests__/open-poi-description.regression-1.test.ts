import { mapOpenPoiRowToPlace } from '@/lib/openPoi'

it('adds a category-based short description when Open POI metadata has none', () => {
  // Regression: Open POI recommendation cards could render without the short explanation requested in QA.
  // Found by /qa on 2026-07-14.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
  expect(mapOpenPoiRowToPlace({
    source: 'overture',
    source_place_id: 'dessert-1',
    name_primary: 'Ann Dessert',
    name_zh: null,
    name_local: null,
    lat: 21.02,
    lng: 105.85,
    category: 'dessert',
    confidence: 0.8,
    metadata: null,
  })).toMatchObject({
    placeId: 'overture:dessert-1',
    description: '甜點／飲料店',
  })
})
