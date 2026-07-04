/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn(),
  fetchReplacementRecommendation: jest.fn(),
}))

// Adding a recommendation now auto smart-arranges the day; stub the arrange
// action to reject so these tests keep the plain append-and-promote behavior.
jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: jest.fn().mockRejectedValue(new Error('no-arrange-in-test')),
}))

// Required mocks to prevent transitive import failures (same pattern as itinerary-date-controls.test.tsx)
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
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: () => null,
}))

jest.mock('@/lib/utils/geo', () => ({
  findClosestDay: jest.fn(() => 0),
}))

jest.mock('@/lib/utils/dragContainers', () => ({
  applyDragResult: jest.fn(),
  findContainer: jest.fn(() => -1),
}))

jest.mock('@/lib/utils/mapUrl', () => ({
  buildDayEmbedUrl: jest.fn(() => null),
}))

jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { getDayRecommendations, fetchReplacementRecommendation } from '@/app/actions/recommend'
import type { PlanResult, RecommendationsByDay, DayRecommendation } from '@/lib/types'

function drec(placeId: string): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type: 'dessert', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, reason: '好吃', sourceLabel: '部落格',
  }
}

const plan: PlanResult = {
  transportMode: 'driving', startDate: '2026-07-01',
  days: [{
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      id: 'x', placeId: 'x', name: '景點X', type: 'attraction', lat: 25, lng: 121, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }],
}

const recsWithReserve: RecommendationsByDay = [{
  dessert: { shown: [drec('d1')], reserve: [drec('d2')] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

const recsNoReserve: RecommendationsByDay = [{
  dessert: { shown: [drec('d1')], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

beforeEach(() => {
  jest.clearAllMocks()
})

it('promotes a reserve item when a card is added', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsWithReserve)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  // d1 removed, reserve d2 slid in; no Google fetch needed
  await waitFor(() => expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument())
  expect(screen.getByTestId('rec-add-d2')).toBeInTheDocument()
  expect(fetchReplacementRecommendation).not.toHaveBeenCalled()
  expect(screen.getByText('d1')).toBeInTheDocument()   // added place shows in itinerary
})

it('fetches a Google replacement when the reserve is empty', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsNoReserve)
  ;(fetchReplacementRecommendation as jest.Mock).mockResolvedValue(drec('g1'))
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchReplacementRecommendation).toHaveBeenCalledTimes(1))
  expect(await screen.findByTestId('rec-add-g1')).toBeInTheDocument()
})

it('leaves the slot empty when Google returns nothing (no crash)', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsNoReserve)
  ;(fetchReplacementRecommendation as jest.Mock).mockResolvedValue(null)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchReplacementRecommendation).toHaveBeenCalledTimes(1))
  expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument()
  expect(screen.getByText('d1')).toBeInTheDocument()   // added place still in itinerary
})
