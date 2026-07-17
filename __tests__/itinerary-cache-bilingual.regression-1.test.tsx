/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('days=2&mode=driving&start=2026-06-01'),
}))

const planItinerary = jest.fn()
jest.mock('@/app/actions/plan', () => ({
  planItinerary: (...args: unknown[]) => planItinerary(...args),
}))

jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: () => <div data-testid="itinerary-client" />,
}))

import ItineraryInner from '@/app/itinerary/ItineraryInner'
import { buildItineraryDraftCacheKey } from '@/lib/itineraryDraftCache'
import type { Place } from '@/lib/types'

const places: Place[] = [
  { id: '1', placeId: 'p1', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  { id: '2', placeId: 'p2', name: 'B', type: 'restaurant', lat: 1, lng: 1, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
]

const normalizedPlan = {
  days: [{ day: 1, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
  transportMode: 'driving',
  startDate: '2026-06-01',
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  planItinerary.mockResolvedValue(normalizedPlan)
})

it('ignores cached drafts with places missing Traditional Chinese names', async () => {
  // Regression: ISSUE-002 — old localStorage itinerary drafts kept rendering
  // a single non-Chinese title even after the bilingual-name fix shipped.
  // Found by /qa on 2026-07-18.
  // Report: .gstack/qa-reports/qa-report-bilingual-cost-2026-07-18.md
  const stalePlan = {
    days: [{
      day: 1,
      aiSummary: null,
      dayStart: '09:00',
      dayEnd: '21:00',
      places: [{
        id: 'hotel-1',
        placeId: 'hotel-1',
        name: 'Hotel du Parc HaNoi',
        localizedName: { zhTw: null, original: 'Hotel du Parc HaNoi' },
        type: 'accommodation',
        lat: 21,
        lng: 105,
        address: 'Hanoi',
        openingHours: null,
        rating: 4.4,
        photoUrl: null,
        description: null,
        startTime: '10:32',
        durationMin: 60,
        travelMinToNext: null,
        aiDescription: null,
        outsideHours: false,
        lateExit: false,
        startLocked: false,
        durationLocked: false,
      }],
    }],
    transportMode: 'driving',
    startDate: '2026-06-01',
  }

  sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
  const cacheKey = buildItineraryDraftCacheKey(places, 2, 'driving', '2026-06-01')
  localStorage.setItem(
    cacheKey,
    JSON.stringify({ plan: stalePlan, savedAt: new Date().toISOString() }),
  )

  render(<ItineraryInner />)

  await waitFor(() => expect(screen.getByTestId('itinerary-client')).toBeInTheDocument())
  expect(planItinerary).toHaveBeenCalledTimes(1)
})
