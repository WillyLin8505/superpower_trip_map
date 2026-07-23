import { mapOpenPoiRowToPlace, mapOpenPoiRowToPlaceWithFreeImages, openPoiSearch } from '@/lib/openPoi'
import type { OpenPoiRow } from '@/lib/openPoi'
import { resolveFreeImageForPlace } from '@/lib/openPoi'

const mockUpdateBuilder: { error: null; eq: jest.Mock } = {
  error: null,
  eq: jest.fn(),
}
const mockUpdate = jest.fn(() => mockUpdateBuilder)
let mockSelectRows: OpenPoiRow[] = []
let mockSelectError: unknown = null
const mockSelectBuilder = {
  eq: jest.fn(() => mockSelectBuilder),
  gte: jest.fn(() => mockSelectBuilder),
  lte: jest.fn(() => mockSelectBuilder),
  limit: jest.fn(async () => ({ data: mockSelectRows, error: mockSelectError })),
}
const mockSelect = jest.fn(() => mockSelectBuilder)
const mockFrom = jest.fn(() => ({ update: mockUpdate, select: mockSelect }))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

const originalEnv = { ...process.env }

beforeEach(() => {
  jest.clearAllMocks()
  mockSelectRows = []
  mockSelectError = null
  mockUpdateBuilder.eq.mockImplementation(() => mockUpdateBuilder)
  mockSelectBuilder.eq.mockImplementation(() => mockSelectBuilder)
  mockSelectBuilder.gte.mockImplementation(() => mockSelectBuilder)
  mockSelectBuilder.lte.mockImplementation(() => mockSelectBuilder)
  mockSelectBuilder.limit.mockImplementation(async () => ({ data: mockSelectRows, error: mockSelectError }))
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
    name_zh: '????',
    name_local: 'B羅i Vi廙',
    lat: 10.768,
    lng: 106.693,
    category: 'attraction',
    confidence: 0.82,
    metadata: { description: 'Nightlife street' },
  })).toMatchObject({
    placeId: 'overture:ov-1',
    name: '????',
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

it('maps open-data quality metadata used by recommendation ranking', () => {
  expect(mapOpenPoiRowToPlace({
    source: 'osm',
    source_place_id: 'node/ranked-dessert',
    name_primary: 'Ranked Dessert',
    name_zh: null,
    name_local: 'Ranked Dessert',
    lat: 21.02,
    lng: 105.85,
    category: 'dessert',
    confidence: 0.91,
    metadata: {
      rating: 4.8,
      review_count: 432,
      osm: { amenity: 'cafe' },
      types: ['bakery'],
    },
  })).toMatchObject({
    rating: 4.8,
    reviewCount: 432,
    categoryTags: ['dessert', 'cafe', 'bakery'],
  })
})

it('prioritizes dessert-specific Open POI rows before nearby generic cafes', async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  const recentMiss = { status: 'not_found', version: 7, fetchedAt: new Date().toISOString() }
  const row = (
    source_place_id: string,
    name_primary: string,
    metadata: OpenPoiRow['metadata'],
    offset: number,
  ): OpenPoiRow => ({
    source: 'osm',
    source_place_id,
    name_primary,
    name_zh: null,
    name_local: name_primary,
    lat: 21 + offset,
    lng: 105,
    category: 'dessert',
    confidence: null,
    metadata: { ...metadata, free_image: recentMiss },
  })
  mockSelectRows = [
    ...Array.from({ length: 8 }, (_, index) =>
      row(`node/generic-${index}`, `Generic Coffee ${index}`, { osm: { amenity: 'cafe' } }, index * 0.0001)
    ),
    row('node/raw-juicery', 'Raw Juicery', { osm: { amenity: 'cafe' } }, 0.004),
    row('node/mochi', 'Mochi Sweets', { osm: { shop: 'confectionery' } }, 0.005),
    row('node/tart', 'C? Ph礙 Apple Tart', { osm: { amenity: 'cafe' } }, 0.006),
    row('node/roti', 'King Roti', { osm: { shop: 'bakery' } }, 0.007),
    row('node/waffle', 'Wanna Waffle?', { osm: { amenity: 'cafe' } }, 0.008),
  ]

  const result = await openPoiSearch(21, 105, 'dessert', 5, 2000)

  expect(result.map((place) => place.name)).toEqual([
    'Raw Juicery',
    'Mochi Sweets',
    'C? Ph礙 Apple Tart',
    'King Roti',
    'Wanna Waffle?',
  ])
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
      name_local: '?艾???萸?颯?踴?芥?詻?',
      lat: 34.665,
      lng: 135.432,
      category: 'attraction',
      confidence: null,
      metadata: { wikidata: 'Q1141980' },
    })).resolves.toMatchObject({
      photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Universal%20Studios%20Japan.jpg?width=900',
      photoUrls: ['https://commons.wikimedia.org/wiki/Special:FilePath/Universal%20Studios%20Japan.jpg?width=900'],
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
    name_local: 'Osaka Castle',
    lat: 34.687,
    lng: 135.526,
    category: 'attraction',
    confidence: null,
    metadata: { wikidata: 'Q321242' },
  })).resolves.toMatchObject({
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Osaka%20Castle%2002bs3200.jpg?width=900',
  })

  expect(mockFrom).toHaveBeenCalledWith('poi_places')
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
    metadata: expect.objectContaining({
      photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Osaka%20Castle%2002bs3200.jpg?width=900',
      photoUrls: ['https://commons.wikimedia.org/wiki/Special:FilePath/Osaka%20Castle%2002bs3200.jpg?width=900'],
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
    name_local: 'Osaka Castle',
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
          title: 'Ozakaj? Osaka castle',
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

it('tops up a one-photo Wikimedia result with Openverse matches for Train Street', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('commons.wikimedia.org/w/api.php')) {
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: {
              '1': {
                title: 'File:Hanoi Train Street 1.jpg',
                imageinfo: [
                  {
                    thumburl: 'https://images.example/train-street-wikimedia.jpg',
                    mime: 'image/jpeg',
                  },
                ],
              },
            },
          },
        }),
      }
    }
    if (url.includes('wikidata.org')) {
      return {
        ok: true,
        json: async () => ({ entities: { Q85788921: { claims: {} } } }),
      }
    }
    if (url.includes('wikipedia.org')) {
      return {
        ok: true,
        json: async () => ({}),
      }
    }
    if (url.includes('api.openverse.org')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'Hanoi Train Street cafe',
              thumbnail: 'https://images.example/train-street-openverse-1.jpg',
              foreign_landing_url: 'https://www.flickr.com/photos/example/hanoi-train-street-1',
              license: 'by',
              creator: 'Example creator',
            },
            {
              title: 'Hanoi Train Street railway',
              thumbnail: 'https://images.example/train-street-openverse-2.jpg',
              foreign_landing_url: 'https://www.flickr.com/photos/example/hanoi-train-street-2',
              license: 'by',
              creator: 'Example creator',
            },
            {
              title: 'Hanoi Train Street view',
              thumbnail: 'https://images.example/train-street-openverse-3.jpg',
              foreign_landing_url: 'https://www.flickr.com/photos/example/hanoi-train-street-3',
              license: 'by',
              creator: 'Example creator',
            },
            {
              title: 'Hanoi Train Street crossing',
              thumbnail: 'https://images.example/train-street-openverse-4.jpg',
              foreign_landing_url: 'https://www.flickr.com/photos/example/hanoi-train-street-4',
              license: 'by',
              creator: 'Example creator',
            },
          ],
        }),
      }
    }

    return {
      ok: true,
      json: async () => ({}),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'way/train-street',
    name_primary: 'Hanoi Train Street',
    name_zh: '火車街',
    name_local: 'Ngõ 224 Lê Duẩn',
    lat: 21.024,
    lng: 105.842,
    category: 'attraction',
    confidence: null,
    metadata: { wikimedia_commons: 'Category:Hanoi Train Street' },
  })).resolves.toMatchObject({
    photoUrl: 'https://images.example/train-street-wikimedia.jpg',
    photoUrls: [
      'https://images.example/train-street-wikimedia.jpg',
      'https://images.example/train-street-openverse-1.jpg',
      'https://images.example/train-street-openverse-2.jpg',
      'https://images.example/train-street-openverse-3.jpg',
      'https://images.example/train-street-openverse-4.jpg',
    ],
  })
})

it('does not use a generic category image when a small local POI has no exact image metadata', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (!url.includes('api.openverse.org')) {
      return {
        ok: true,
        json: async () => ({ results: [] }),
      }
    }

    const query = new URL(url).searchParams.get('q')
    return {
      ok: true,
      json: async () => ({
        results: query === 'cafe dessert cake' ? [
          {
            title: 'Cafe dessert counter',
            thumbnail: 'https://images.example/generic-cafe-dessert.jpg',
            foreign_landing_url: 'https://www.flickr.com/photos/example/generic-cafe-dessert',
            license: 'by',
            creator: 'Example creator',
          },
        ] : [],
      }),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch

  await expect(mapOpenPoiRowToPlaceWithFreeImages({
    source: 'osm',
    source_place_id: 'node/1308439468',
    name_primary: 'MVTTS ?',
    name_zh: 'MVTTS ?',
    name_local: 'C? Ph礙 MVTTS',
    lat: 21.0284992,
    lng: 105.8484194,
    category: 'dessert',
    confidence: null,
    metadata: { osm: { amenity: 'cafe' } },
  })).resolves.toMatchObject({
    photoUrl: null,
    photoUrls: [],
  })

  expect(fetchMock).not.toHaveBeenCalledWith(
    expect.stringContaining('q=cafe+dessert+cake'),
    expect.anything(),
  )
})

it('uses Wikimedia Commons search to resolve five localized landmark images', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('commons.wikimedia.org/w/api.php')) {
      return {
        ok: true,
        json: async () => ({
          query: {
            pages: Object.fromEntries(
              Array.from({ length: 5 }, (_, index) => [
                String(index + 1),
                {
                  title: `File:Asakusa Shrine ${index + 1}.jpg`,
                  imageinfo: [{
                    thumburl: `https://upload.wikimedia.org/asakusa-shrine-${index + 1}.jpg`,
                    mime: 'image/jpeg',
                  }],
                },
              ])
            ),
          },
        }),
      }
    }

    return {
      ok: true,
      json: async () => ({ results: [] }),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch

  const result = await resolveFreeImageForPlace({
    placeId: 'user:asakusa-shrine',
    placeName: '浅草神社',
    category: 'attraction',
    allowGeneric: true,
    limit: 5,
  })

  expect(result?.generic).toBeUndefined()
  expect(result).toMatchObject({
    source: 'wikimedia_commons',
    photoUrls: [
      'https://upload.wikimedia.org/asakusa-shrine-1.jpg',
      'https://upload.wikimedia.org/asakusa-shrine-2.jpg',
      'https://upload.wikimedia.org/asakusa-shrine-3.jpg',
      'https://upload.wikimedia.org/asakusa-shrine-4.jpg',
      'https://upload.wikimedia.org/asakusa-shrine-5.jpg',
    ],
  })
  expect(fetchMock).not.toHaveBeenCalledWith(
    expect.stringContaining('q=travel+landmark+attraction'),
    expect.anything(),
  )
})

it('returns up to five generic Openverse category images when generic fallback is allowed', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (!url.includes('api.openverse.org')) {
      return {
        ok: true,
        json: async () => ({ results: [] }),
      }
    }

    const query = new URL(url).searchParams.get('q')
    return {
      ok: true,
      json: async () => ({
        results: query === 'cafe dessert cake'
          ? [1, 2, 3, 4, 5, 6].map((index) => ({
            title: `Cafe dessert ${index}`,
            thumbnail: `https://images.example/generic-dessert-${index}.jpg`,
            foreign_landing_url: `https://www.flickr.com/photos/example/generic-dessert-${index}`,
            license: 'by',
            creator: 'Example creator',
          }))
          : [],
      }),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch

  const result = await resolveFreeImageForPlace({
    placeId: 'osm:node/no-image-dessert',
    placeName: 'No Image Dessert',
    category: 'dessert',
    allowGeneric: true,
    limit: 5,
  })

  expect(result?.generic).toBe(true)
  expect(result?.photoUrls).toHaveLength(5)
  expect(result?.photoUrls.every((url) => /^https:\/\/images\.example\/generic-dessert-\d+\.jpg$/.test(url))).toBe(true)
})

it('varies generic Openverse category fallback photos between different places', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (!url.includes('api.openverse.org')) {
      return {
        ok: true,
        json: async () => ({ results: [] }),
      }
    }

    const query = new URL(url).searchParams.get('q')
    return {
      ok: true,
      json: async () => ({
        results: query === 'cafe dessert cake'
          ? Array.from({ length: 18 }, (_, index) => ({
            title: `Cafe dessert ${index + 1}`,
            thumbnail: `https://images.example/generic-dessert-${index + 1}.jpg`,
            foreign_landing_url: `https://www.flickr.com/photos/example/generic-dessert-${index + 1}`,
            license: 'by',
            creator: 'Example creator',
          }))
          : [],
      }),
    }
  })
  global.fetch = fetchMock as unknown as typeof fetch

  const first = await resolveFreeImageForPlace({
    placeId: 'osm:node/no-image-dessert-a',
    placeName: 'No Image Dessert A',
    category: 'dessert',
    allowGeneric: true,
    limit: 5,
  })
  const second = await resolveFreeImageForPlace({
    placeId: 'osm:node/no-image-dessert-b',
    placeName: 'No Image Dessert B',
    category: 'dessert',
    allowGeneric: true,
    limit: 5,
  })

  expect(first?.generic).toBe(true)
  expect(second?.generic).toBe(true)
  expect(first?.photoUrls).toHaveLength(5)
  expect(second?.photoUrls).toHaveLength(5)
  expect(second?.photoUrls).not.toEqual(first?.photoUrls)
})

it('ignores previously persisted generic free image metadata', () => {
  expect(mapOpenPoiRowToPlace({
    source: 'osm',
    source_place_id: 'node/orick',
    name_primary: 'Orick Coffee',
    name_zh: null,
    name_local: 'Orick Coffee',
    lat: 21.028,
    lng: 105.848,
    category: 'dessert',
    confidence: null,
    metadata: {
      photoUrl: 'https://images.example/generic-cafe-dessert.jpg',
      photoUrls: ['https://images.example/generic-cafe-dessert.jpg'],
      free_image: {
        status: 'found',
        version: 7,
        source: 'openverse',
        generic: true,
        url: 'https://images.example/generic-cafe-dessert.jpg',
        urls: ['https://images.example/generic-cafe-dessert.jpg'],
      },
    },
  })).toMatchObject({
    photoUrl: null,
    photoUrls: [],
  })
})

it('ignores stale persisted free image URLs after the resolver version changes', () => {
  expect(mapOpenPoiRowToPlace({
    source: 'osm',
    source_place_id: 'node/stale-openverse',
    name_primary: 'King Roti',
    name_zh: null,
    name_local: 'King Roti',
    lat: 21.028,
    lng: 105.848,
    category: 'dessert',
    confidence: null,
    metadata: {
      photoUrl: 'https://api.openverse.org/v1/images/broken/thumb/',
      photoUrls: ['https://api.openverse.org/v1/images/broken/thumb/'],
      free_image: {
        status: 'found',
        version: 3,
        source: 'openverse',
        url: 'https://api.openverse.org/v1/images/broken/thumb/',
        urls: ['https://api.openverse.org/v1/images/broken/thumb/'],
      },
    },
  })).toMatchObject({
    photoUrl: null,
    photoUrls: [],
  })
})

it('normalizes direct Wikimedia original image URLs to embeddable thumbnails', () => {
  expect(mapOpenPoiRowToPlace({
    source: 'osm',
    source_place_id: 'way/hanoi-train-street',
    name_primary: 'Hanoi Train Street',
    name_zh: '火車街',
    name_local: 'Ngõ 224 Lê Duẩn',
    lat: 21.017,
    lng: 105.84,
    category: 'attraction',
    confidence: null,
    metadata: {
      photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Hanoi_-_Bahngleis_0002.JPG',
    },
  })).toMatchObject({
    photoUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hanoi_-_Bahngleis_0002.JPG?width=900',
    photoUrls: ['https://commons.wikimedia.org/wiki/Special:FilePath/Hanoi_-_Bahngleis_0002.JPG?width=900'],
  })
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
        version: 7,
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
        version: 7,
      }),
    }),
  }))
})
