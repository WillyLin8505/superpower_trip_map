import { tripIdFromReferer, currentTripId } from '@/lib/apiUsageContext'
import type { Place } from '@/lib/types'

// --- tripIdFromReferer (pure) ---
describe('tripIdFromReferer', () => {
  it('extracts the tripId from an itinerary-page referer', () => {
    expect(tripIdFromReferer('http://localhost/itinerary/abc-123')).toBe('abc-123')
    expect(tripIdFromReferer('https://app.com/itinerary/abc-123?tab=x#y')).toBe('abc-123')
  })

  it('returns undefined for missing or non-itinerary referers', () => {
    expect(tripIdFromReferer(null)).toBeUndefined()
    expect(tripIdFromReferer(undefined)).toBeUndefined()
    expect(tripIdFromReferer('https://app.com/')).toBeUndefined()
    expect(tripIdFromReferer('https://app.com/trips')).toBeUndefined()
  })
})

// --- /api/photo attributes the fetch to the referer trip ---
const mockTracked = jest.fn()
jest.mock('@/lib/apiUsageEvents', () => ({
  trackedApiFetch: (...args: unknown[]) => mockTracked(...args),
}))

import { GET } from '@/app/api/photo/route'
import { NextRequest } from 'next/server'

describe('GET /api/photo attribution', () => {
  beforeEach(() => {
    mockTracked.mockReset()
    mockTracked.mockResolvedValue({ ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(4) })
  })

  it('passes the referer tripId into the usage event', async () => {
    const req = new NextRequest('http://localhost/api/photo?ref=X', {
      headers: { referer: 'http://localhost/itinerary/trip-photo' },
    })
    await GET(req)
    expect(mockTracked).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ tripId: 'trip-photo', skuHint: 'place_photo_media' }),
    )
  })

  it('records undefined tripId when there is no itinerary referer', async () => {
    const req = new NextRequest('http://localhost/api/photo?ref=X')
    await GET(req)
    expect(mockTracked).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({ tripId: undefined }),
    )
  })
})

// --- LINE ingest runs its Google calls inside the bound trip's context ---
let lineSeenTrip: string | null = 'UNSET'

jest.mock('@/lib/line/bindings', () => ({
  getActiveLineGroupBinding: jest.fn(async () => ({ tripId: 'trip-line', writeAsUserId: 'owner' })),
}))
jest.mock('@/lib/line/client', () => ({
  getLineProfile: jest.fn(async () => ({ displayName: 'Amy' })),
}))
jest.mock('@/app/actions/places', () => ({
  searchPlace: jest.fn(async () => {
    lineSeenTrip = currentTripId()
    return { placeId: 'p1', name: '鼎泰豐' } as unknown as Place
  }),
  verifyPlace: jest.fn(),
}))
jest.mock('@/lib/candidates', () => ({ addCandidateFromLine: jest.fn(async () => 'added') }))
jest.mock('@/app/actions/ai', () => ({ extractItinerary: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))

import { processLineTextMessage } from '@/lib/line/ingest'

describe('LINE ingest attribution', () => {
  it('runs the place lookup inside the bound trip context', async () => {
    lineSeenTrip = 'UNSET'
    await processLineTextMessage({ lineGroupId: 'g', lineUserId: 'u', messageId: 'm', text: '鼎泰豐' })
    expect(lineSeenTrip).toBe('trip-line')
  })
})
