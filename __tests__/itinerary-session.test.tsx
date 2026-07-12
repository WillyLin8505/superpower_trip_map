/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

// Mock Next.js navigation
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('days=2&mode=driving&start=2026-06-01'),
}))

// Mock the server action
const plannedResult = {
  days: [{ day: 1, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
  transportMode: 'driving',
  startDate: '2026-06-01',
}

jest.mock('@/app/actions/plan', () => ({
  planItinerary: jest.fn(),
}))

// Mock ItineraryClient so we only test the page shell
jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: () => <div data-testid="itinerary-client" />,
}))

import ItineraryInner from '@/app/itinerary/ItineraryInner'
import { planItinerary } from '@/app/actions/plan'

describe('ItineraryPage', () => {
  const places = [
    { id: '1', placeId: 'p1', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
    { id: '2', placeId: 'p2', name: 'B', type: 'restaurant', lat: 1, lng: 1, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
    localStorage.clear()
    ;(planItinerary as jest.Mock).mockResolvedValue(plannedResult)
  })

  it('redirects to / when sessionStorage has no places', async () => {
    render(<ItineraryInner />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('redirects to / when places array has fewer than 2 items', async () => {
    sessionStorage.setItem('pendingPlaces', JSON.stringify([{ id: '1' }]))
    render(<ItineraryInner />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'))
  })

  it('calls planItinerary and renders ItineraryClient when places are valid', async () => {
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    render(<ItineraryInner />)
    await waitFor(() => expect(screen.getByTestId('itinerary-client')).toBeInTheDocument())
    expect(planItinerary).toHaveBeenCalledWith(places, 2, 'driving', '2026-06-01')
  })

  it('stores generated plans in localStorage so the same search can be reused', async () => {
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    render(<ItineraryInner />)

    await waitFor(() => expect(screen.getByTestId('itinerary-client')).toBeInTheDocument())

    const matchingKeys = Object.keys(localStorage).filter((key) => key.startsWith('itineraryDraft:v1:'))
    expect(matchingKeys).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(matchingKeys[0])!)).toEqual(
      expect.objectContaining({ plan: plannedResult, savedAt: expect.any(String) }),
    )
  })

  it('reuses cached plans without calling planItinerary again', async () => {
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    render(<ItineraryInner />)
    await waitFor(() => expect(screen.getByTestId('itinerary-client')).toBeInTheDocument())
    expect(planItinerary).toHaveBeenCalledTimes(1)

    jest.clearAllMocks()
    render(<ItineraryInner />)

    await waitFor(() => expect(screen.getAllByTestId('itinerary-client')).toHaveLength(2))
    expect(planItinerary).not.toHaveBeenCalled()
    expect(screen.getByText('已載入上次規劃結果，未重新呼叫規劃服務。')).toBeInTheDocument()
  })
})
