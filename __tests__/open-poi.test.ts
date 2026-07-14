import { mapOpenPoiRowToPlace } from '@/lib/openPoi'

it('maps an open-data POI row to a recommendation-safe Place without Google enrichment', () => {
  expect(mapOpenPoiRowToPlace({
    source: 'overture',
    source_place_id: 'ov-1',
    name_primary: 'Bui Vien Walking Street',
    name_zh: '范五老街',
    name_local: 'Bùi Viện',
    lat: 10.768,
    lng: 106.693,
    category: 'attraction',
    confidence: 0.82,
    metadata: { description: 'Nightlife street' },
  })).toMatchObject({
    placeId: 'overture:ov-1',
    name: '范五老街',
    type: 'attraction',
    lat: 10.768,
    lng: 106.693,
    rating: null,
    openingHours: null,
    photoUrl: null,
    source: 'overture',
    sourceLabel: 'Open POI',
  })
})
