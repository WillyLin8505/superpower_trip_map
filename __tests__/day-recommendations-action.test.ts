jest.mock('fs/promises', () => ({ readFile: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))
jest.mock('@/lib/claude', () => ({ callClaude: jest.fn() }))
jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(),
  getPlaceDetails: jest.fn(),
  nearbySearch: jest.fn(),
}))

import { getDayRecommendations } from '@/app/actions/recommend'
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

beforeEach(() => jest.clearAllMocks())

it('fills each category to 5 with nearby results, excluding existing places', async () => {
  r.mockResolvedValue('[]')                       // no sources configured
  // nearby returns 6 candidates per category; one collides with the existing place id
  ns.mockImplementation(async (_lat: number, _lng: number, type: string) =>
    Array.from({ length: 6 }, (_, i) => place(`${type}-${i}`, type as Place['type']))
  )
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))

  const result = await getDayRecommendations([oneDay('attraction-0')])

  expect(result).toHaveLength(1)
  expect(result[0].dessert).toHaveLength(5)
  expect(result[0].attraction).toHaveLength(5)
  expect(result[0].restaurant).toHaveLength(5)
  // existing itinerary place must not be recommended
  expect(result[0].attraction.map((x) => x.placeId)).not.toContain('attraction-0')
  // fill items are labelled as Google
  expect(result[0].dessert[0].sourceLabel).toBe('Google 推薦')
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

  const dessert = result[0].dessert
  expect(dessert).toHaveLength(5)
  // first item is the website extraction, kept ahead of Google fills
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
      allIds.push(...dayResult[cat].map((x) => x.placeId))
    }
  }

  // No placeId should appear more than once across the entire trip result
  const unique = new Set(allIds)
  expect(allIds.length).toBe(unique.size)

  // Specifically, 'shared-1' must appear at most once total across both days
  expect(allIds.filter((id) => id === 'shared-1').length).toBeLessThanOrEqual(1)
})
