jest.mock('fs/promises', () => ({ readFile: jest.fn() }))
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

import { getDayRecommendations } from '@/app/actions/recommend'
import { readFile } from 'fs/promises'
import { getPlaceDetails, nearbySearch } from '@/app/actions/places'
import { openPoiSearch } from '@/lib/openPoi'
import type { DayItinerary, Place } from '@/lib/types'

const readFileMock = readFile as jest.Mock
const nearbySearchMock = nearbySearch as jest.Mock
const getPlaceDetailsMock = getPlaceDetails as jest.Mock
const openPoiSearchMock = openPoiSearch as jest.Mock
const originalDetailsMode = process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE

function place(id: string, type: Place['type'], description: string | null): Place {
  return {
    id,
    placeId: id,
    name: id,
    type,
    lat: 25,
    lng: 121,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description,
  }
}

function oneDay(): DayItinerary {
  return {
    day: 1,
    aiSummary: null,
    dayStart: '09:00',
    dayEnd: '21:00',
    places: [{
      ...place('existing', 'attraction', null),
      startTime: '09:00',
      durationMin: 90,
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE = 'live'
  readFileMock.mockResolvedValue('[]')
  openPoiSearchMock.mockResolvedValue([])
})

afterEach(() => {
  if (originalDetailsMode === undefined) delete process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE
  else process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE = originalDetailsMode
})

it('preserves nearby short descriptions when Google details has no description', async () => {
  // Regression: details enrichment could overwrite a nearby short explanation with null.
  // Found by /qa on 2026-07-14.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
  nearbySearchMock.mockImplementation(async (_lat: number, _lng: number, category: string) =>
    category === 'dessert' ? [place('dessert-1', 'dessert', '甜點／飲料店')] : []
  )
  getPlaceDetailsMock.mockResolvedValue(place('dessert-1', 'dessert', null))

  const result = await getDayRecommendations([oneDay()])

  expect(result[0].dessert.shown[0].description).toBe('甜點／飲料店')
})
