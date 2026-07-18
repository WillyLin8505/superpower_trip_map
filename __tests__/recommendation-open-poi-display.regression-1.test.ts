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
jest.mock('@/lib/googleTranslate', () => ({
  translateTextToZhTw: jest.fn(),
}))

import { getDayRecommendations } from '@/app/actions/recommend'
import { readFile } from 'fs/promises'
import { nearbySearch } from '@/app/actions/places'
import { openPoiSearch } from '@/lib/openPoi'
import { translateTextToZhTw } from '@/lib/googleTranslate'
import type { DayItinerary, Place } from '@/lib/types'

const readFileMock = readFile as jest.Mock
const nearbySearchMock = nearbySearch as jest.Mock
const openPoiSearchMock = openPoiSearch as jest.Mock
const translateTextToZhTwMock = translateTextToZhTw as jest.Mock
const originalPaidFallbackMode = process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE

function openPoiPlace(id: string, name: string): Place {
  return {
    id,
    placeId: `osm:${id}`,
    name,
    localizedName: { zhTw: null, original: name },
    type: 'dessert',
    lat: 21.02,
    lng: 105.85,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    photoUrls: [],
    description: '甜點／飲料店',
  }
}

function oneDay(): DayItinerary {
  return {
    day: 1,
    aiSummary: null,
    dayStart: '09:00',
    dayEnd: '21:00',
    places: [{
      ...openPoiPlace('center', '大阪城'),
      type: 'attraction',
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
  process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = 'off'
  readFileMock.mockResolvedValue('[]')
  nearbySearchMock.mockResolvedValue([])
  translateTextToZhTwMock.mockImplementation(async (text: string) =>
    text === 'Wanna Waffle?' ? '想吃鬆餅？' : null
  )
})

afterAll(() => {
  if (originalPaidFallbackMode === undefined) delete process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE
  else process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = originalPaidFallbackMode
})

it('translates Open POI recommendation names to Chinese primary while keeping the local name as secondary', async () => {
  // Regression: Open POI recommendations could render as one-line local names
  // because they bypassed the bilingual normalization used by planned places.
  openPoiSearchMock.mockImplementation(async (_lat: number, _lng: number, category: string) => {
    if (category !== 'dessert') return []
    return [
      openPoiPlace('waffle-1', 'Wanna Waffle?'),
      openPoiPlace('waffle-2', 'Timeline'),
      openPoiPlace('waffle-3', 'Trang Anh'),
      openPoiPlace('waffle-4', 'King Roti'),
      openPoiPlace('waffle-5', 'Apple Tart'),
    ]
  })

  const result = await getDayRecommendations([oneDay()])

  expect(result[0].dessert.shown[0]).toMatchObject({
    name: '想吃鬆餅？',
    localizedName: {
      zhTw: '想吃鬆餅？',
      original: 'Wanna Waffle?',
    },
  })
  expect(nearbySearchMock).not.toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'dessert')
})
