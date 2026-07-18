import { mapOpenPoiRowToPlace, mapOpenPoiRowToPlaceWithFreeImages } from '@/lib/openPoi'

const mockUpdateBuilder: { error: null; eq: jest.Mock } = {
  error: null,
  eq: jest.fn(),
}
const mockUpdate = jest.fn(() => mockUpdateBuilder)
const mockFrom = jest.fn(() => ({ update: mockUpdate }))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

const originalEnv = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  mockUpdateBuilder.eq.mockImplementation(() => mockUpdateBuilder)
  process.env = { ...originalEnv }
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  process.env = originalEnv
  jest.restoreAllMocks()
})

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

it('persists resolved free image metadata back to poi_places', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      entities: {
        Q321242: {
          claims: {
            P18: [
              {
                mainsnak: {
                  datavalue: {
                    value: 'Osaka Castle 02bs3200.jpg',
                  },
                },
              },
            ],
          },
        },
      },
    }),
  })) as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'way/34619038',
    name_primary: 'Osaka Castle',
    name_zh: '大阪城',
    name_local: '大阪城',
    lat: 34.687,
    lng: 135.526,
    category: 'attraction',
    confidence: null,
    metadata: { wikidata: 'Q321242' },
  })).resolves.toMatchObject({
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Osaka%20Castle%2002bs3200.jpg',
  })

  expect(mockFrom).toHaveBeenCalledWith('poi_places')
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Osaka%20Castle%2002bs3200.jpg',
      photoUrls: ['https://commons.wikimedia.org/wiki/Special:FilePath/Osaka%20Castle%2002bs3200.jpg'],
      free_image: expect.objectContaining({
        status: 'found',
        source: 'wikidata',
      }),
    }),
  }))
})

it('resolves Wikimedia Commons category metadata to a free image', async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      query: {
        pages: {
          '1': {
            title: 'File:Osaka Castle cherry blossoms.jpg',
            imageinfo: [
              {
                thumburl: 'https://upload.wikimedia.org/osaka-castle-cherry.jpg',
                mime: 'image/jpeg',
                extmetadata: {
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  Artist: { value: 'Example photographer' },
                },
              },
            ],
          },
        },
      },
    }),
  })) as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'way/34619038',
    name_primary: 'Osaka Castle',
    name_zh: '大阪城',
    name_local: '大阪城',
    lat: 34.687,
    lng: 135.526,
    category: 'attraction',
    confidence: null,
    metadata: { wikimedia_commons: 'Category:Osaka Castle' },
  })).resolves.toMatchObject({
    photoUrl: 'https://upload.wikimedia.org/osaka-castle-cherry.jpg',
    photoUrls: ['https://upload.wikimedia.org/osaka-castle-cherry.jpg'],
  })
})

it('uses Openverse exact search when metadata has no direct Wikimedia image', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          title: 'Ozakajō Osaka castle',
          thumbnail: 'https://api.openverse.org/v1/images/osaka-castle/thumb/',
          foreign_landing_url: 'https://www.flickr.com/photos/example/osaka-castle',
          license: 'by',
          creator: 'Example creator',
        },
      ],
    }),
  })) as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'way/openverse',
    name_primary: 'Osaka Castle',
    name_zh: null,
    name_local: 'Osaka Castle',
    lat: 34.687,
    lng: 135.526,
    category: 'attraction',
    confidence: null,
    metadata: {},
  })).resolves.toMatchObject({
    photoUrl: 'https://api.openverse.org/v1/images/osaka-castle/thumb/',
    photoUrls: ['https://api.openverse.org/v1/images/osaka-castle/thumb/'],
  })

  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      free_image: expect.objectContaining({
        source: 'openverse',
        license: 'by',
        attribution: 'Example creator',
      }),
    }),
  }))
})

it('uses alternate names to resolve free images for localized landmark names', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('api.openverse.org')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'Hanoi Train Street',
              thumbnail: 'https://images.example/hanoi-train-street.jpg',
              foreign_landing_url: 'https://www.flickr.com/photos/example/hanoi-train-street',
              license: 'by',
              creator: 'Example creator',
            },
          ],
        }),
      }
    }

    return {
      ok: true,
      json: async () => ({ results: [] }),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'way/train-street',
    name_primary: '火車街',
    name_zh: '火車街',
    name_local: 'Ngõ 224 Lê Duẩn',
    lat: 21.024,
    lng: 105.842,
    category: 'attraction',
    confidence: null,
    metadata: {},
  })).resolves.toMatchObject({
    photoUrl: 'https://images.example/hanoi-train-street.jpg',
    photoUrls: ['https://images.example/hanoi-train-street.jpg'],
  })

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('q=Hanoi+Train+Street'),
    expect.anything(),
  )
})

it('skips external image lookups for recent not-found cache entries', async () => {
  global.fetch = jest.fn() as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'node/recent-miss',
    name_primary: 'No Image Cafe',
    name_zh: null,
    name_local: 'No Image Cafe',
    lat: 21.024,
    lng: 105.847,
    category: 'dessert',
    confidence: null,
    metadata: {
      wikidata: 'Q999999',
      free_image: {
        status: 'not_found',
        version: 1,
        fetchedAt: new Date().toISOString(),
      },
    },
  })).resolves.toMatchObject({
    photoUrl: null,
    photoUrls: [],
  })

  expect(global.fetch).not.toHaveBeenCalled()
})

it('persists not-found image lookups so future reloads skip external searches', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ results: [] }),
  })) as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'node/no-image',
    name_primary: 'No Image Cafe',
    name_zh: null,
    name_local: 'No Image Cafe',
    lat: 21.024,
    lng: 105.847,
    category: 'dessert',
    confidence: null,
    metadata: {},
  })).resolves.toMatchObject({
    photoUrl: null,
    photoUrls: [],
  })

  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      free_image: expect.objectContaining({
        status: 'not_found',
        version: 1,
      }),
    }),
  }))
})
