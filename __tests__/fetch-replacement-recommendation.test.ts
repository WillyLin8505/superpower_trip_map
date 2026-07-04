jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(),
  getPlaceDetails: jest.fn(),
  nearbySearch: jest.fn(),
}))

import { fetchReplacementRecommendation } from '@/app/actions/recommend'
import { getPlaceDetails, nearbySearch } from '@/app/actions/places'
import type { DayItinerary, Place } from '@/lib/types'

const gd = getPlaceDetails as jest.Mock
const ns = nearbySearch as jest.Mock

function place(id: string, type: Place['type']): Place {
  return {
    id, placeId: id, name: id, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: 4.5, photoUrl: null, description: null,
  }
}

function dayWith(placeId: string): DayItinerary {
  return {
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      ...place(placeId, 'attraction'),
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }
}

beforeEach(() => jest.clearAllMocks())

it('returns the first non-excluded enriched candidate', async () => {
  ns.mockResolvedValue([place('a', 'dessert'), place('b', 'dessert')])
  gd.mockImplementation(async (id: string) => place(id, 'attraction'))
  const out = await fetchReplacementRecommendation(dayWith('x'), 'dessert', ['a'])
  expect(out?.placeId).toBe('b')
  expect(out?.type).toBe('dessert')
  expect(out?.sourceLabel).toBe('Google 推薦')
})

it('returns null when all candidates are excluded', async () => {
  ns.mockResolvedValue([place('a', 'dessert')])
  gd.mockResolvedValue(place('a', 'attraction'))
  expect(await fetchReplacementRecommendation(dayWith('x'), 'dessert', ['a'])).toBeNull()
})

it('returns null when nearbySearch is empty', async () => {
  ns.mockResolvedValue([])
  expect(await fetchReplacementRecommendation(dayWith('x'), 'restaurant', [])).toBeNull()
})

it('returns null (without calling nearbySearch) when the day has no places', async () => {
  const emptyDay: DayItinerary = { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [] }
  expect(await fetchReplacementRecommendation(emptyDay, 'dessert', [])).toBeNull()
  expect(ns).not.toHaveBeenCalled()
})
