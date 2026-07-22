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

const getPlaceDetailsMock = getPlaceDetails as jest.Mock
const buildDistanceMatrixMock = buildDistanceMatrix as jest.Mock
const optimizeRouteMock = optimizeRoute as jest.Mock
const schedulePlacesMock = schedulePlaces as jest.Mock
const applyLegDefaultsMock = applyLegDefaults as jest.Mock
const generateDaySummariesMock = generateDaySummaries as jest.Mock
const OLD_ENV = process.env

function place(id: string): Place {
  return {
    id,
    placeId: id,
    name: id,
    type: 'attraction',
    lat: 35,
    lng: 139,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    photoUrls: [],
    description: null,
  }
}

function scheduled(input: Place): ScheduledPlace {
  return {
    ...input,
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

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...OLD_ENV, NODE_ENV: 'production', GOOGLE_MAPS_PLANNING_DETAILS_MODE: 'off' }
})

afterEach(() => {
  process.env = OLD_ENV
})

it('does not call full Place Details for every place when planning details mode is off', async () => {
  const input = [place('p1'), place('p2')]
  const days: DayItinerary[] = [{
    day: 1,
    aiSummary: null,
    dayStart: '09:00',
    dayEnd: '21:00',
    places: input.map(scheduled),
  }]

  buildDistanceMatrixMock.mockResolvedValue({ indices: ['p1', 'p2'], matrix: [[0, 1], [1, 0]] })
  optimizeRouteMock.mockResolvedValue(['p1', 'p2'])
  schedulePlacesMock.mockResolvedValue(days)
  applyLegDefaultsMock.mockResolvedValue(days)
  generateDaySummariesMock.mockResolvedValue(days)

  await planItinerary(input, 1, 'driving', '2026-07-13')

  expect(getPlaceDetailsMock).not.toHaveBeenCalled()
  expect(buildDistanceMatrixMock).toHaveBeenCalledWith(input, 'driving')
  expect(generateDaySummariesMock).not.toHaveBeenCalled()
})
