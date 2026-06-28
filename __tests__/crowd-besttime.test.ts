// __tests__/crowd-besttime.test.ts
import { fetchBestTimeForecast } from '@/lib/crowd/besttime'
import type { Place } from '@/lib/types'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function place(): Place {
  return {
    id: 'id', placeId: 'pid', name: '鼎泰豐', type: 'restaurant',
    lat: 25, lng: 121, address: 'Taipei', openingHours: null, rating: 4.4,
    photoUrl: null, description: null,
  }
}

function dayObj(dayInt: number, fill: number) {
  return {
    day_info: { day_int: dayInt },
    day_raw: Array.from({ length: 24 }, () => fill),
    hour_analysis: [],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  delete process.env.BESTTIME_PRIVATE_KEY
})

test('returns null when no API key', async () => {
  const r = await fetchBestTimeForecast(place())
  expect(r).toBeNull()
  expect(mockFetch).not.toHaveBeenCalled()
})

test('parses analysis into weekly + venueId on OK', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK',
      venue_info: { venue_id: 'ven_abc' },
      analysis: [dayObj(0, 50), dayObj(6, 80)],
    }),
  })
  const r = await fetchBestTimeForecast(place())
  expect(r?.source).toBe('besttime')
  expect(r?.venueId).toBe('ven_abc')
  expect(r?.weekly[0][10]).toBe(50)
  expect(r?.weekly[6][10]).toBe(80)
  expect(r?.weekly[3][10]).toBeNull() // day not in analysis
})

test('closed hour (intensity_nr 999) → null', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({
    json: async () => ({
      status: 'OK',
      venue_info: { venue_id: 'v' },
      analysis: [{ day_info: { day_int: 0 }, day_raw: Array.from({ length: 24 }, () => 30), hour_analysis: [{ hour: 3, intensity_nr: 999 }] }],
    }),
  })
  const r = await fetchBestTimeForecast(place())
  expect(r?.weekly[0][3]).toBeNull()
  expect(r?.weekly[0][10]).toBe(30)
})

test('returns null on non-OK status', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockResolvedValueOnce({ json: async () => ({ status: 'Error' }) })
  expect(await fetchBestTimeForecast(place())).toBeNull()
})

test('returns null on fetch throw', async () => {
  process.env.BESTTIME_PRIVATE_KEY = 'k'
  mockFetch.mockRejectedValueOnce(new Error('network'))
  expect(await fetchBestTimeForecast(place())).toBeNull()
})
