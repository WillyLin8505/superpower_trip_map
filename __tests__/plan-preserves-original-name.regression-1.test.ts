jest.mock('@/app/actions/places', () => ({ getPlaceDetails: jest.fn() }))
jest.mock('@/app/actions/directions', () => ({ buildDistanceMatrix: jest.fn() }))
jest.mock('@/app/actions/optimize', () => ({ optimizeRoute: jest.fn() }))
jest.mock('@/app/actions/schedule', () => ({ schedulePlaces: jest.fn() }))
jest.mock('@/app/actions/legs', () => ({ applyLegDefaults: jest.fn() }))
jest.mock('@/app/actions/ai', () => ({ generateDaySummaries: jest.fn() }))

import { planItinerary } from '@/app/actions/plan'
import { getPlaceDetails } from '@/app/actions/places'
import { buildDistanceMatrix } from '@/app/actions/directions'
import { optimizeRoute } from '@/app/actions/optimize'
import { schedulePlaces } from '@/app/actions/schedule'
import { applyLegDefaults } from '@/app/actions/legs'
import { generateDaySummaries } from '@/app/actions/ai'
import type { DayItinerary, Place, ScheduledPlace } from '@/lib/types'

const getDetailsMock = getPlaceDetails as jest.Mock
const buildDistanceMatrixMock = buildDistanceMatrix as jest.Mock
const optimizeRouteMock = optimizeRoute as jest.Mock
const schedulePlacesMock = schedulePlaces as jest.Mock
const applyLegDefaultsMock = applyLegDefaults as jest.Mock
const generateDaySummariesMock = generateDaySummaries as jest.Mock

const originalName = 'B\u00e1nh M\u00ec Huynh Hoa - L\u00ea Th\u1ecb Ri\u00eang'
const englishName = 'Banh Mi Huynh Hoa - Le Thi Rieng'

function place(): Place {
  return {
    id: 'p1',
    placeId: 'banh-mi',
    name: englishName,
    localizedName: {
      zhTw: null,
      en: englishName,
      original: originalName,
    },
    type: 'restaurant',
    lat: 10.77,
    lng: 106.69,
    address: 'Ho Chi Minh City',
    openingHours: null,
    rating: 4.8,
    photoUrl: null,
    photoUrls: [],
    description: null,
  }
}

function scheduled(input: Place): ScheduledPlace {
  return {
    ...input,
    startTime: '09:00',
    durationMin: 60,
    travelMinToNext: null,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    startLocked: false,
    durationLocked: false,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

it('passes the existing original localized name back into getPlaceDetails during planning', async () => {
  const input = place()
  const scheduledPlace = scheduled(input)
  const days: DayItinerary[] = [{
    day: 1,
    aiSummary: null,
    dayStart: '09:00',
    dayEnd: '21:00',
    places: [scheduledPlace],
  }]

  getDetailsMock.mockResolvedValue(input)
  buildDistanceMatrixMock.mockResolvedValue({ indices: [input.placeId], matrix: [[0]] })
  optimizeRouteMock.mockResolvedValue([input.placeId])
  schedulePlacesMock.mockResolvedValue(days)
  applyLegDefaultsMock.mockResolvedValue(days)
  generateDaySummariesMock.mockResolvedValue(days)

  await planItinerary([input], 1, 'driving', '2026-07-13')

  expect(getDetailsMock).toHaveBeenCalledWith(input.placeId, originalName)
})
