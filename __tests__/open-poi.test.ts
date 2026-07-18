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

it('maps open-data image metadata to a recommendation cover photo', () => {
  expect(mapOpenPoiRowToPlace({
    source: 'osm',
    source_place_id: 'node/1',
    name_primary: 'Wanna Waffle?',
    name_zh: null,
    name_local: 'Wanna Waffle?',
    lat: 21.02,
    lng: 105.85,
    category: 'dessert',
    confidence: null,
    metadata: { image: 'https://images.example/waffle.jpg' },
  })).toMatchObject({
    photoUrl: 'https://images.example/waffle.jpg',
    photoUrls: ['https://images.example/waffle.jpg'],
  })
})
