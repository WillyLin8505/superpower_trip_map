jest.mock('fs/promises', () => ({ readFile: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))
jest.mock('@/lib/claude', () => ({ callClaude: jest.fn() }))
jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(),
  getPlaceDetails: jest.fn(),
  nearbySearch: jest.fn(),
}))

import { getDayRecommendations, refreshDayCategoryRecommendations } from '@/app/actions/recommend'
import { readFile } from 'fs/promises'
import { scrapeText } from '@/app/actions/scrape'
import { callClaude } from '@/lib/claude'
import { searchPlace, getPlaceDetails, nearbySearch } from '@/app/actions/places'
import type { DayItinerary, Place } from '@/lib/types'

const r = readFile as jest.Mock
const st = scrapeText as jest.Mock
const cc = callClaude as jest.Mock
const sp = searchPlace as jest.Mock
const gd = getPlaceDetails as jest.Mock
const ns = nearbySearch as jest.Mock
const origRecommendationDetailsMode = process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE

function place(id: string, type: Place['type']): Place {
  return {
    id, placeId: id, name: id, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: 4.5, photoUrl: null, description: null,
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

beforeEach(() => {
  jest.clearAllMocks()
  if (origRecommendationDetailsMode === undefined) delete process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE
  else process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE = origRecommendationDetailsMode
})

it('fills each category to 5 with nearby results, excluding existing places', async () => {
  r.mockResolvedValue('[]')                       // no sources configured
  // nearby returns 6 candidates per category; one collides with the existing place id
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 6 }, (_, i) => place(`${type}-${i}`, type as Place['type']))
  )
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

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
  r.mockResolvedValue('[]')
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 5 }, (_, i) => place(`${type}-${i}`, type as Place['type']))
  )
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('existing')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(gd).not.toHaveBeenCalled()
})

it('uses website extractions first, then fills the remainder', async () => {
  r.mockResolvedValue(JSON.stringify([{ id: 's1', url: 'http://x', label: '部落格', lastFetchedAt: null, lastFetchStatus: null }]))
  st.mockResolvedValue('某甜點店 很好吃')
  cc.mockResolvedValue(
    '[{"name":"某甜點店","type":"dessert","reason":"招牌必吃","sourceLabel":"部落格"}]'
  )
  sp.mockResolvedValue(place('blog-dessert', 'attraction'))  // searchPlace returns Place; type overridden to dessert
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 6 }, (_, i) => place(`${type}-${i}`, type as Place['type']))
  )
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

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

  r.mockResolvedValue('[]')   // no sources → no extractions
  // Every nearbySearch call returns 'shared-1' as its first result, plus unique fillers
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    [
      place('shared-1', type as Place['type']),
      ...Array.from({ length: 6 }, (_, i) => place(`${type}-d-${i}`, type as Place['type']))
    ]
  )
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

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

it('keeps website extractions beyond 5 in reserve', async () => {
  r.mockResolvedValue(JSON.stringify([{ id: 's1', url: 'http://x', label: '部落格', lastFetchedAt: null, lastFetchStatus: null }]))
  const { scrapeText } = await import('@/app/actions/scrape')
  ;(scrapeText as jest.Mock).mockResolvedValue('a b c d e f g')
  const { callClaude } = await import('@/lib/claude')
  ;(callClaude as jest.Mock).mockResolvedValue(
    JSON.stringify(
      Array.from({ length: 7 }, (_, i) => ({ name: `甜點${i}`, type: 'dessert', reason: 'r', sourceLabel: '部落格' }))
    )
  )
  // each website name resolves to a distinct dessert place
  sp.mockImplementation(async (name: string) => place(`blog-${name}`, 'dessert'))
  ns.mockResolvedValue([])   // no Google needed
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].dessert.reserve).toHaveLength(2)
  // reserve items are website-sourced, not Google
  expect(result[0].dessert.reserve.every((x) => x.sourceLabel === '部落格')).toBe(true)
})

// --- TASK-010: getDayRecommendations must resolve centers via DEC-304, not just day-or-trip centroid ---
it('an empty day walks backward to the previous day centroid, not straight to the trip mean', async () => {
  function scheduledPlace(id: string, lat: number, lng: number) {
    return {
      ...place(id, 'attraction'), lat, lng,
      startTime: '09:00', durationMin: 90, travelMinToNext: null as null, aiDescription: null as null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }
  }
  const day0: DayItinerary = { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [scheduledPlace('p0', 10, 10)] }
  const day1: DayItinerary = { day: 2, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [scheduledPlace('p1', 50, 50)] }
  const day2: DayItinerary = { day: 3, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [] } // empty — no centroid of its own

  r.mockResolvedValue('[]')
  ns.mockResolvedValue([])
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

  await getDayRecommendations([day0, day1, day2])

  // day2's nearbySearch calls must use day1's centroid (50,50) — the trip mean of (10,10)+(50,50) would be (30,30)
  const day2Calls = ns.mock.calls.filter(([lat, lng]: [number, number]) => lat === 50 && lng === 50)
  expect(day2Calls.length).toBeGreaterThan(0)
  const wrongCalls = ns.mock.calls.filter(([lat, lng]: [number, number]) => lat === 30 && lng === 30)
  expect(wrongCalls).toHaveLength(0)
})

// --- TASK-010: refreshDayCategoryRecommendations (換一批) ---
describe('refreshDayCategoryRecommendations', () => {
  it('returns up to 5 fresh candidates for one category, excluding given ids', async () => {
    ns.mockResolvedValue(Array.from({ length: 6 }, (_, i) => place(`dessert-${i}`, 'dessert')))
    gd.mockImplementation(async (id: string) => place(id, 'dessert'))

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
    ns.mockResolvedValue([place('only-1', 'dessert')])
    gd.mockImplementation(async (id: string) => place(id, 'dessert'))

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
