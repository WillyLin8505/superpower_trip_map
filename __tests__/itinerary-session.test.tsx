/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

// Mock Next.js navigation
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => new URLSearchParams('days=2&mode=driving'),
}))

// Mock the server action
jest.mock('@/app/actions/plan', () => ({
  planItinerary: jest.fn().mockResolvedValue({
    days: [{ day: 1, places: [], aiSummary: null }],
    transportMode: 'driving',
  }),
}))

// Mock ItineraryClient so we only test the page shell
jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: () => <div data-testid="itinerary-client" />,
}))

import ItineraryInner from '@/app/itinerary/ItineraryInner'
import { planItinerary } from '@/app/actions/plan'

describe('ItineraryPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    sessionStorage.clear()
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
    const places = [
      { id: '1', placeId: 'p1', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
      { id: '2', placeId: 'p2', name: 'B', type: 'restaurant', lat: 1, lng: 1, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
    ]
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    render(<ItineraryInner />)
    await waitFor(() => expect(screen.getByTestId('itinerary-client')).toBeInTheDocument())
    expect(planItinerary).toHaveBeenCalledWith(places, 2, 'driving')
  })
})
