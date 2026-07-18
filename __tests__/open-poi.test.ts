import { mapOpenPoiRowToPlace, mapOpenPoiRowToPlaceWithFreeImages } from '@/lib/openPoi'

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

it('resolves a free Wikidata image when direct OSM image metadata is missing', async () => {
  const realFetch = global.fetch
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      entities: {
        Q1141980: {
          claims: {
            P18: [
              {
                mainsnak: {
                  datavalue: {
                    value: 'Universal Studios Japan.jpg',
                  },
                },
              },
            ],
          },
        },
      },
    }),
  })) as unknown as typeof fetch

  try {
    await expect(mapOpenPoiRowToPlaceWithFreeImages({
      source: 'osm',
      source_place_id: 'node/1141980',
      name_primary: 'Universal Studios Japan',
      name_zh: null,
      name_local: 'ユニバーサル・スタジオ・ジャパン',
      lat: 34.665,
      lng: 135.432,
      category: 'attraction',
      confidence: null,
      metadata: { wikidata: 'Q1141980' },
    })).resolves.toMatchObject({
      photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Universal%20Studios%20Japan.jpg',
      photoUrls: ['https://commons.wikimedia.org/wiki/Special:FilePath/Universal%20Studios%20Japan.jpg'],
    })
  } finally {
    global.fetch = realFetch
  }
})
