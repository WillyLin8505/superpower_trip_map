jest.mock('@/lib/recommendationSources', () => ({ getRecommendationSources: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))
jest.mock('@/lib/claude', () => ({ callClaude: jest.fn() }))
jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(),
  getPlaceDetails: jest.fn(),
  nearbySearch: jest.fn(),
}))
jest.mock('@/lib/openPoi', () => ({
  openPoiSearch: jest.fn(),
}))

import { getDayRecommendations, refreshDayCategoryRecommendations } from '@/app/actions/recommend'
import { getRecommendationSources } from '@/lib/recommendationSources'
import { scrapeText } from '@/app/actions/scrape'
import { callClaude } from '@/lib/claude'
import { searchPlace, getPlaceDetails, nearbySearch } from '@/app/actions/places'
import { openPoiSearch } from '@/lib/openPoi'
import type { DayItinerary, Place } from '@/lib/types'

const grs = getRecommendationSources as jest.Mock
const st = scrapeText as jest.Mock
const cc = callClaude as jest.Mock
const sp = searchPlace as jest.Mock
const gd = getPlaceDetails as jest.Mock
const ns = nearbySearch as jest.Mock
const ops = openPoiSearch as jest.Mock
const origRecommendationDetailsMode = process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE
const origPaidFallbackMode = process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE

function place(
  id: string,
  type: Place['type'],
  overrides: Partial<Place> & { reviewCount?: number | null; categoryTags?: string[] } = {}
): Place {
  const base: Place = {
    id, placeId: id, name: id, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: 4.5, photoUrl: null, description: null,
  }
  return { ...base, ...overrides }
}

function placeWithPhoto(
  id: string,
  type: Place['type'],
  overrides: Partial<Place> & { reviewCount?: number | null; categoryTags?: string[] } = {}
): Place {
  const base = place(id, type, overrides)
  return {
    ...base,
    photoUrl: base.photoUrl ?? `https://img.example/${id}.jpg`,
    photoUrls: base.photoUrls ?? [`https://img.example/${id}.jpg`],
  }
}

function oneDay(existingPlaceId: string): DayItinerary {
  return {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      ...place(existingPlaceId, 'attraction'),
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }
}

function emptyDay(day = 1): DayItinerary {
  return {
    day, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  grs.mockResolvedValue([])
  ops.mockResolvedValue([])
  if (origRecommendationDetailsMode === undefined) delete process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE
  else process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE = origRecommendationDetailsMode
  if (origPaidFallbackMode === undefined) delete process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE
  else process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = origPaidFallbackMode
})

it('fills recommendations from open POI before calling Google Nearby Search', async () => {
  grs.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 5 }, (_, i) => placeWithPhoto(`open-${type}-${i}`, type as Place['type']))
  )
  ns.mockResolvedValue([])

  const result = await getDayRecommendations([oneDay('existing')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].dessert.shown[0].sourceLabel).toBe('Open POI')
  expect(ns).not.toHaveBeenCalled()
})

it('fills each category to 5 with nearby results, excluding existing places', async () => {
  grs.mockResolvedValue([])                       // no sources configured
  // nearby returns 6 candidates per category; one collides with the existing place id
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 6 }, (_, i) => placeWithPhoto(`${type}-${i}`, type as Place['type']))
  )
  gd.mockImplementation(async (id: string) => placeWithPhoto(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  expect(result).toHaveLength(1)
  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].attraction.shown).toHaveLength(5)
  expect(result[0].restaurant.shown).toHaveLength(5)
  // existing itinerary place must not be recommended
  expect(result[0].attraction.shown.map((x) => x.placeId)).not.toContain('attraction-0')
  // fill items are labelled as Google and go to shown, never reserve
  expect(result[0].dessert.shown[0].sourceLabel).toBe('Google 推薦')
  expect(result[0].dessert.reserve).toEqual([])
})

it('can fill Google recommendations from Nearby Search without per-card Place Details', async () => {
  process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE = 'nearby-only'
  grs.mockResolvedValue([])
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 5 }, (_, i) => placeWithPhoto(`${type}-${i}`, type as Place['type']))
  )
  gd.mockImplementation(async (id: string) => placeWithPhoto(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('existing')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(gd).not.toHaveBeenCalled()
})

it('orders fill candidates by rating quality, review confidence, and category fit', async () => {
  grs.mockResolvedValue([])
  ns.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) => {
    if (type !== 'dessert') return []
    return [
      placeWithPhoto('high-stars-low-confidence', 'dessert', { rating: 4.9, reviewCount: 4, categoryTags: ['cafe'] }),
      placeWithPhoto('wrong-category-popular', 'restaurant', { rating: 4.9, reviewCount: 8000, categoryTags: ['lodging', 'restaurant'] }),
      placeWithPhoto('trusted-dessert', 'dessert', { rating: 4.6, reviewCount: 2500, categoryTags: ['bakery', 'cafe'] }),
      placeWithPhoto('good-dessert', 'dessert', { rating: 4.7, reviewCount: 500, categoryTags: ['dessert'] }),
      placeWithPhoto('thin-dessert', 'dessert', { rating: 4.1, reviewCount: 30, categoryTags: ['cafe'] }),
      placeWithPhoto('unrated-dessert', 'dessert', { rating: null, reviewCount: null, categoryTags: ['bakery'] }),
    ]
  })

  const result = await getDayRecommendations([oneDay('existing')])

  expect(result[0].dessert.shown.map((candidate) => candidate.placeId)).toEqual([
    'trusted-dessert',
    'good-dessert',
    'high-stars-low-confidence',
    'thin-dessert',
    'unrated-dessert',
  ])
})

it('skips cafe-only dessert candidates without rating or review confidence', async () => {
  process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = 'on'
  grs.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) => {
    if (type !== 'dessert') return []
    return [
      place('orick-coffee', 'dessert', { rating: null, reviewCount: null, categoryTags: ['cafe', 'coffee_shop'] }),
      placeWithPhoto('trusted-bakery-1', 'dessert', { rating: 4.6, reviewCount: 500, categoryTags: ['bakery'] }),
      placeWithPhoto('trusted-bakery-2', 'dessert', { rating: 4.5, reviewCount: 300, categoryTags: ['dessert'] }),
      placeWithPhoto('trusted-bakery-3', 'dessert', { rating: 4.4, reviewCount: 250, categoryTags: ['cake_shop'] }),
      placeWithPhoto('trusted-bakery-4', 'dessert', { rating: 4.3, reviewCount: 200, categoryTags: ['ice_cream_shop'] }),
    ]
  })
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    type === 'dessert'
      ? [placeWithPhoto('google-dessert-topup', 'dessert', { rating: 4.7, reviewCount: 1000, categoryTags: ['bakery', 'food'] })]
      : []
  )

  const result = await getDayRecommendations([oneDay('existing')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].dessert.shown.map((candidate) => candidate.placeId)).not.toContain('orick-coffee')
  expect(result[0].dessert.shown.map((candidate) => candidate.placeId)).toContain('google-dessert-topup')
})

it('fills dessert recommendations from dessert-named cafes while excluding generic coffee shops', async () => {
  process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = 'off'
  grs.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) => {
    if (type !== 'dessert') return []
    return [
      place('orick-coffee', 'dessert', { name: 'Orick Coffee', rating: null, reviewCount: null, categoryTags: ['cafe', 'coffee_shop'] }),
      placeWithPhoto('mochi-sweets', 'dessert', { name: 'Mochi Sweets', rating: null, reviewCount: null, categoryTags: ['cafe', 'coffee_shop'] }),
      placeWithPhoto('waffle-house', 'dessert', { name: 'Waffle House', rating: null, reviewCount: null, categoryTags: ['cafe'] }),
      placeWithPhoto('cake-studio', 'dessert', { name: 'Cake Studio', rating: null, reviewCount: null, categoryTags: ['cafe'] }),
      placeWithPhoto('ice-cream-bar', 'dessert', { name: 'Ice Cream Bar', rating: null, reviewCount: null, categoryTags: ['cafe'] }),
      placeWithPhoto('tra-bat-bao', 'dessert', { name: 'Trà Bát Bảo Tuấn Béo', rating: null, reviewCount: null, categoryTags: ['cafe'] }),
    ]
  })
  ns.mockResolvedValue([])

  const result = await getDayRecommendations([oneDay('existing')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].dessert.shown.map((candidate) => candidate.placeId)).toEqual([
    'mochi-sweets',
    'waffle-house',
    'cake-studio',
    'ice-cream-bar',
    'tra-bat-bao',
  ])
  expect(ns).not.toHaveBeenCalled()
})

it('deduplicates same-place Open POI recommendations with different source ids', async () => {
  process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = 'off'
  grs.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) => {
    if (type !== 'dessert') return []
    return [
      placeWithPhoto('osm:node/oh', 'dessert'),
      placeWithPhoto('osm:way/oh', 'dessert'),
      placeWithPhoto('osm:node/mochi', 'dessert'),
      placeWithPhoto('osm:node/tart', 'dessert'),
      placeWithPhoto('osm:node/roti', 'dessert'),
      placeWithPhoto('osm:node/waffle', 'dessert'),
    ].map((candidate) =>
      candidate.placeId.endsWith('/oh')
        ? {
          ...candidate,
          name: 'OH',
          localizedName: { zhTw: null, original: 'OH' },
          lat: candidate.placeId.includes('node') ? 25.0001 : 25.02,
          lng: candidate.placeId.includes('node') ? 121.0001 : 121.02,
        }
        : candidate
    )
  })
  ns.mockResolvedValue([])

  const result = await getDayRecommendations([oneDay('existing')])
  const dessertIds = result[0].dessert.shown.map((candidate) => candidate.placeId)

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(dessertIds.filter((placeId) => placeId.endsWith('/oh'))).toHaveLength(1)
  expect(new Set(dessertIds).size).toBe(dessertIds.length)
})

it('excludes existing itinerary places by name and nearby coordinates, not only placeId', async () => {
  process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = 'off'
  grs.mockResolvedValue([])
  const existingDay = oneDay('google-train-street')
  existingDay.places[0] = {
    ...existingDay.places[0],
    name: 'Hanoi Train Street',
    localizedName: { zhTw: '火車街', original: 'Ngõ 224 Lê Duẩn' },
    lat: 21.0241,
    lng: 105.8421,
  }
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) => {
    if (type !== 'attraction') return []
    return [
      placeWithPhoto('osm:way/train-street', 'attraction'),
      ...Array.from({ length: 5 }, (_, i) => placeWithPhoto(`osm:way/attraction-${i}`, 'attraction')),
    ].map((candidate) =>
      candidate.placeId === 'osm:way/train-street'
        ? {
          ...candidate,
          name: 'Hanoi Train Street',
          localizedName: { zhTw: '火車街', original: 'Ngõ 224 Lê Duẩn' },
          lat: 21.0242,
          lng: 105.8422,
        }
        : candidate
    )
  })
  ns.mockResolvedValue([])

  const result = await getDayRecommendations([existingDay])

  expect(result[0].attraction.shown).toHaveLength(5)
  expect(result[0].attraction.shown.map((candidate) => candidate.placeId)).not.toContain('osm:way/train-street')
})

it('does not use paid Google Nearby fallback when recommendation paid fallback is disabled', async () => {
  // Regression: ISSUE-001 — reloading a saved itinerary auto-filled missing
  // recommendations through paid Google Nearby Search, adding about US$0.20 for
  // a 2-day trip (2 days × 3 categories × $0.032).
  // Found by /qa on 2026-07-18.
  process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = 'off'
  grs.mockResolvedValue([])
  ops.mockResolvedValue([])
  ns.mockResolvedValue(Array.from({ length: 5 }, (_, i) => place(`paid-${i}`, 'dessert')))

  const result = await getDayRecommendations([oneDay('existing')])

  expect(ns).not.toHaveBeenCalled()
  expect(result[0].dessert.shown).toEqual([])
  expect(result[0].attraction.shown).toEqual([])
  expect(result[0].restaurant.shown).toEqual([])
})

it('starts same-day category recommendation lookups in parallel to reduce initial wait time', async () => {
  grs.mockResolvedValue([])
  ns.mockResolvedValue([])
  const pending: Array<{ type: Place['type']; resolve: (places: Place[]) => void }> = []
  ops.mockImplementation((_lat: number, _lng: number, type: Place['type']) =>
    new Promise<Place[]>((resolve) => {
      pending.push({ type, resolve })
    })
  )

  const resultPromise = getDayRecommendations([oneDay('existing')])
  await Promise.resolve()

  expect(pending.map((request) => request.type)).toEqual(
    expect.arrayContaining(['dessert', 'attraction', 'restaurant'])
  )

  pending.forEach(({ type, resolve }) => {
    resolve(Array.from({ length: 5 }, (_, i) => placeWithPhoto(`open-${type}-${i}`, type)))
  })

  const result = await resultPromise
  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].attraction.shown).toHaveLength(5)
  expect(result[0].restaurant.shown).toHaveLength(5)
})

it('uses website extractions first, then fills the remainder', async () => {
  grs.mockResolvedValue([{ id: 's1', url: 'http://x', label: '部落格', lastFetchedAt: null, lastFetchStatus: null }])
  st.mockResolvedValue('某甜點店 很好吃')
  cc.mockResolvedValue(
    '[{"name":"某甜點店","type":"dessert","reason":"招牌必吃","sourceLabel":"部落格"}]'
  )
  sp.mockResolvedValue(placeWithPhoto('blog-dessert', 'attraction'))  // searchPlace returns Place; type overridden to dessert
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 6 }, (_, i) => placeWithPhoto(`${type}-${i}`, type as Place['type']))
  )
  gd.mockImplementation(async (id: string) => placeWithPhoto(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  const dessert = result[0].dessert.shown
  expect(dessert).toHaveLength(5)
  expect(dessert[0].placeId).toBe('blog-dessert')
  expect(dessert[0].sourceLabel).toBe('部落格')
  expect(dessert[0].type).toBe('dessert')
})

it('deduplicates fill candidates across days so no placeId appears in more than one day', async () => {
  function scheduledPlace(id: string, t: Place['type']) {
    return {
      ...place(id, t),
      startTime: '09:00', durationMin: 90, travelMinToNext: null as null, aiDescription: null as null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }
  }

  const day0: DayItinerary = {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [scheduledPlace('existing-0', 'attraction')],
  }
  const day1: DayItinerary = {
    day: 2, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [scheduledPlace('existing-1', 'attraction')],
  }

  grs.mockResolvedValue([])   // no sources → no extractions
  // Every nearbySearch call returns 'shared-1' as its first result, plus unique fillers
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    [
      placeWithPhoto('shared-1', type as Place['type']),
      ...Array.from({ length: 6 }, (_, i) => placeWithPhoto(`${type}-d-${i}`, type as Place['type']))
    ]
  )
  gd.mockImplementation(async (id: string) => placeWithPhoto(id, 'attraction'))

  const result = await getDayRecommendations([day0, day1])

  expect(result).toHaveLength(2)

  // Collect every recommended placeId across both days and all categories
  const allIds: string[] = []
  for (const dayResult of result) {
    for (const cat of ['dessert', 'attraction', 'restaurant'] as const) {
      allIds.push(...dayResult[cat].shown.map((x) => x.placeId))
    }
  }

  // No placeId should appear more than once across the entire trip result
  const unique = new Set(allIds)
  expect(allIds.length).toBe(unique.size)

  // Specifically, 'shared-1' must appear at most once total across both days
  expect(allIds.filter((id) => id === 'shared-1').length).toBeLessThanOrEqual(1)
})

it('uses deeper Open POI candidate pools so later days do not go empty after trip-wide dedupe', async () => {
  // Regression: ISSUE-002 - Open POI was queried with a limit of 5. Day 1 could
  // consume those five attractions, then day 2 saw the same five as duplicates
  // and rendered 景點 0 even though more local candidates existed.
  // Found by /qa on 2026-07-17.
  // Report: .gstack/qa-reports/qa-report-attraction-recommendations-2026-07-17.md
  function scheduledPlace(id: string): DayItinerary['places'][number] {
    return {
      ...place(id, 'attraction'),
      startTime: '09:00',
      durationMin: 90,
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }
  }
  const day0: DayItinerary = {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [scheduledPlace('existing-0')],
  }
  const day1: DayItinerary = {
    day: 2, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [scheduledPlace('existing-1')],
  }
  grs.mockResolvedValue([])
  ns.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string, limit: number) => {
    if (type !== 'attraction') return []
    return Array.from({ length: limit }, (_, i) => placeWithPhoto(`open-attraction-${i}`, 'attraction'))
  })

  const result = await getDayRecommendations([day0, day1])

  expect(result[0].attraction.shown).toHaveLength(5)
  expect(result[1].attraction.shown).toHaveLength(5)
  expect(result[1].attraction.shown.map((place) => place.placeId)).toEqual([
    'open-attraction-5',
    'open-attraction-6',
    'open-attraction-7',
    'open-attraction-8',
    'open-attraction-9',
  ])
  const requestedAttractionLimits = ops.mock.calls
    .filter((call) => call[2] === 'attraction')
    .map((call) => call[3] as number)
  expect(Math.max(...requestedAttractionLimits)).toBeGreaterThan(5)
})

it('keeps website extractions beyond 5 in reserve', async () => {
  grs.mockResolvedValue([{ id: 's1', url: 'http://x', label: '部落格', lastFetchedAt: null, lastFetchStatus: null }])
  const { scrapeText } = await import('@/app/actions/scrape')
  ;(scrapeText as jest.Mock).mockResolvedValue('a b c d e f g')
  const { callClaude } = await import('@/lib/claude')
  ;(callClaude as jest.Mock).mockResolvedValue(
    JSON.stringify(
      Array.from({ length: 7 }, (_, i) => ({ name: `甜點${i}`, type: 'dessert', reason: 'r', sourceLabel: '部落格' }))
    )
  )
  // each website name resolves to a distinct dessert place
  sp.mockImplementation(async (name: string) => placeWithPhoto(`blog-${name}`, 'dessert'))
  ns.mockResolvedValue([])   // no Google needed
  gd.mockImplementation(async (id: string) => placeWithPhoto(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].dessert.reserve).toHaveLength(2)
  // reserve items are website-sourced, not Google
  expect(result[0].dessert.reserve.every((x) => x.sourceLabel === '部落格')).toBe(true)
})

// --- TASK-010: getDayRecommendations must resolve centers via DEC-304, not just day-or-trip centroid ---
it('does not fill recommendations for an empty day without a manual center', async () => {
  function scheduledPlace(id: string, lat: number, lng: number) {
    return {
      ...place(id, 'attraction'), lat, lng,
      startTime: '09:00', durationMin: 90, travelMinToNext: null as null, aiDescription: null as null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }
  }
  const day0: DayItinerary = { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [scheduledPlace('p0', 10, 10)] }
  const day1 = emptyDay(2)

  grs.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 5 }, (_, i) => placeWithPhoto(`open-${type}-${i}`, type as Place['type']))
  )

  const result = await getDayRecommendations([day0, day1])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[1].dessert.shown).toEqual([])
  expect(result[1].attraction.shown).toEqual([])
  expect(result[1].restaurant.shown).toEqual([])
  expect(ops).toHaveBeenCalledTimes(3)
})

it('does not read recommendation sources when every day lacks an itinerary and manual center', async () => {
  const result = await getDayRecommendations([emptyDay(1), emptyDay(2)])

  expect(result).toHaveLength(2)
  expect(result[0].dessert.shown).toEqual([])
  expect(result[1].restaurant.shown).toEqual([])
  expect(grs).not.toHaveBeenCalled()
  expect(st).not.toHaveBeenCalled()
  expect(cc).not.toHaveBeenCalled()
  expect(ops).not.toHaveBeenCalled()
  expect(ns).not.toHaveBeenCalled()
})

it('fills recommendations for an empty day when the user sets a manual center', async () => {
  const day = {
    ...emptyDay(),
    recommendationCenter: { placeId: 'center-1', name: 'Manual Center', lat: 25, lng: 121, address: null, source: 'manual' as const },
  }

  grs.mockResolvedValue([])
  ops.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 5 }, (_, i) => placeWithPhoto(`open-${type}-${i}`, type as Place['type']))
  )

  const result = await getDayRecommendations([day])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].attraction.shown).toHaveLength(5)
  expect(result[0].restaurant.shown).toHaveLength(5)
})

// --- TASK-010: refreshDayCategoryRecommendations (換一批) ---
describe('refreshDayCategoryRecommendations', () => {
  it('returns up to 5 fresh candidates for one category, excluding given ids', async () => {
    ns.mockResolvedValue(Array.from({ length: 6 }, (_, i) => placeWithPhoto(`dessert-${i}`, 'dessert')))
    gd.mockImplementation(async (id: string) => placeWithPhoto(id, 'dessert'))

    const result = await refreshDayCategoryRecommendations({
      category: 'dessert',
      center: { lat: 25, lng: 121 },
      excludeIds: ['dessert-0'],
    })

    expect(result.length).toBeLessThanOrEqual(5)
    expect(result.map((r) => r.placeId)).not.toContain('dessert-0')
    expect(result.every((r) => r.sourceLabel === 'Google 推薦')).toBe(true)
  })

  it('returns fewer than 5 when Google has fewer available candidates', async () => {
    ns.mockResolvedValue([placeWithPhoto('only-1', 'dessert')])
    gd.mockImplementation(async (id: string) => placeWithPhoto(id, 'dessert'))

    const result = await refreshDayCategoryRecommendations({
      category: 'dessert', center: { lat: 25, lng: 121 }, excludeIds: [],
    })
    expect(result).toHaveLength(1)
  })

  it('returns an empty array when nearbySearch throws (recoverable, preserves previous cards upstream)', async () => {
    ns.mockRejectedValue(new Error('network'))
    const result = await refreshDayCategoryRecommendations({
      category: 'dessert', center: { lat: 25, lng: 121 }, excludeIds: [],
    })
    expect(result).toEqual([])
  })
})
