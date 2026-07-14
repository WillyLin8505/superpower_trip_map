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
import { nearbySearch } from '@/app/actions/places'
import { openPoiSearch } from '@/lib/openPoi'
import type { DayItinerary, Place } from '@/lib/types'

const readFileMock = readFile as jest.Mock
const nearbySearchMock = nearbySearch as jest.Mock
const openPoiSearchMock = openPoiSearch as jest.Mock

function place(id: string, type: Place['type']): Place {
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
    description: type === 'dessert' ? '甜點／飲料店' : null,
  }
}

function oneDay(): DayItinerary {
  return {
    day: 1,
    aiSummary: null,
    dayStart: '09:00',
    dayEnd: '21:00',
    places: [{
      ...place('existing', 'attraction'),
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
  readFileMock.mockResolvedValue('[]')
  nearbySearchMock.mockResolvedValue([])
})

it('expands the local Open POI radius to fill five recommendations before using Google', async () => {
  // Regression: initial recommendations could stop at three Open POI cards instead of filling the category to five.
  // Found by /qa on 2026-07-14.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
  openPoiSearchMock.mockImplementation(async (_lat: number, _lng: number, category: string, _limit: number, radius?: number) => {
    if (category !== 'dessert') return []
    if ((radius ?? 4000) <= 4000) {
      return [place('open-1', 'dessert'), place('open-2', 'dessert'), place('open-3', 'dessert')]
    }
    return [
      place('open-1', 'dessert'),
      place('open-2', 'dessert'),
      place('open-3', 'dessert'),
      place('open-4', 'dessert'),
      place('open-5', 'dessert'),
    ]
  })

  const result = await getDayRecommendations([oneDay()])

  expect(result[0].dessert.shown).toHaveLength(5)
  expect(result[0].dessert.shown.every((rec) => rec.description === '甜點／飲料店')).toBe(true)
  expect(nearbySearchMock).not.toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'dessert')
})
