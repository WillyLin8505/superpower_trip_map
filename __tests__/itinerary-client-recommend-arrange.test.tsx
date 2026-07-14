/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const mockGetPlaceDetails = jest.fn()
const mockFetch = jest.fn()
const realFetch = global.fetch

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn(),
  fetchReplacementRecommendation: jest.fn(),
  refreshDayCategoryRecommendations: jest.fn(),
}))

jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: jest.fn(),
}))

jest.mock('@/lib/utils/clientScheduler', () => ({
  recalcPlan: jest.fn((p: unknown) => p),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: () => null,
  pointerWithin: jest.fn(() => []),
  rectIntersection: jest.fn(() => []),
  PointerSensor: class {},
  useSensor: jest.fn(() => ({})),
  useSensors: jest.fn((...args: unknown[]) => args),
  useDroppable: jest.fn(() => ({ setNodeRef: jest.fn(), isOver: false })),
}))
jest.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {}, listeners: {}, setNodeRef: jest.fn(),
    transform: null, transition: null, isDragging: false,
  }),
}))
jest.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }))
jest.mock('@/components/CombinedInput', () => ({ CombinedInput: () => null }))
jest.mock('@/lib/utils/geo', () => ({ findClosestDay: jest.fn(() => 0) }))
jest.mock('@/lib/utils/dragContainers', () => ({
  applyDragResult: jest.fn(), findContainer: jest.fn(() => -1),
}))
jest.mock('@/lib/utils/mapUrl', () => ({ buildDayEmbedUrl: jest.fn(() => null) }))
jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { getDayRecommendations } from '@/app/actions/recommend'
import { fetchDayArrangeInputs } from '@/app/actions/arrange'
import type { PlanResult, RecommendationsByDay, DayRecommendation, Place } from '@/lib/types'

function drec(placeId: string): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type: 'dessert', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: '/api/photo?ref=cover', photoUrls: ['/api/photo?ref=cover'],
    description: null, reason: 'nearby', sourceLabel: 'Google',
  }
}

const plan: PlanResult = {
  transportMode: 'driving', startDate: '2026-07-01',
  days: [{
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      id: 'x', placeId: 'x', name: 'Existing', type: 'attraction', lat: 25, lng: 121, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }],
}

const recs: RecommendationsByDay = [{
  dessert: { shown: [drec('d1')], reserve: [drec('d2')] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

beforeEach(() => {
  jest.clearAllMocks()
  mockGetPlaceDetails.mockResolvedValue(null)
  mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.startsWith('/api/place-details')) {
      const params = new URL(`https://test.local${url}`).searchParams
      return {
        ok: true,
        json: async () => ({
          place: await mockGetPlaceDetails(params.get('placeId'), params.get('originalName')),
        }),
      }
    }
    if (url === '/api/place-index' && init?.method === 'POST') {
      return { ok: true, json: async () => ({ ok: true }) }
    }
    return { ok: false, json: async () => ({}) }
  })
  global.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  global.fetch = realFetch
})

it('does not auto smart-arrange when a recommendation is added', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recs)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(screen.getByText('d1')).toBeInTheDocument())
  expect(fetchDayArrangeInputs).not.toHaveBeenCalled()
})

it('enriches details and stores the minimal place index only after add', async () => {
  const details: Place = {
    id: 'details-d1',
    placeId: 'd1',
    name: 'Detailed Dessert',
    type: 'dessert',
    lat: 25.1,
    lng: 121.1,
    address: 'Taipei',
    openingHours: ['Monday: 9:00 AM – 6:00 PM'],
    rating: 4.8,
    photoUrl: '/api/photo?ref=details-cover',
    photoUrls: ['/api/photo?ref=details-cover', '/api/photo?ref=details-extra'],
    description: 'Detailed description',
  }
  mockGetPlaceDetails.mockResolvedValue(details)
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recs)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(mockGetPlaceDetails).toHaveBeenCalledWith('d1', 'd1'))
  const placeIndexCall = mockFetch.mock.calls.find(([input, init]) =>
    String(input) === '/api/place-index' && init?.method === 'POST'
  )
  expect(placeIndexCall).toBeDefined()
  expect(JSON.parse(String(placeIndexCall?.[1]?.body))).toEqual({
    placeId: 'd1',
    name: 'Detailed Dessert',
    lat: 25.1,
    lng: 121.1,
    category: 'dessert',
  })
  expect(screen.getByText('Detailed Dessert')).toBeInTheDocument()
})
