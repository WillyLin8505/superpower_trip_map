/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn(),
  fetchReplacementRecommendation: jest.fn(),
}))

// Adding a recommendation should auto smart-arrange the day → this action fires.
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
jest.mock('@/lib/utils/mapUrl', () => ({ buildDayEmbedUrl: jest.fn(() => null), buildPlaceMapsUrl: jest.fn(() => 'https://maps.google.com/maps/search/?api=1&query=test'), }))
jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { getDayRecommendations } from '@/app/actions/recommend'
import { fetchDayArrangeInputs } from '@/app/actions/arrange'
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

const recs: RecommendationsByDay = [{
  dessert: { shown: [drec('d1')], reserve: [drec('d2')] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

beforeEach(() => { jest.clearAllMocks() })

it('auto smart-arranges the day when a recommendation is added (includes the new place)', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recs)
  ;(fetchDayArrangeInputs as jest.Mock).mockResolvedValue({ indices: [], matrix: [], crowdByPlaceId: {} })
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchDayArrangeInputs).toHaveBeenCalled())
  // the arrange runs over the day AFTER the new place was appended (景點X + d1)
  const placesArg = (fetchDayArrangeInputs as jest.Mock).mock.calls[0][0]
  expect(placesArg).toHaveLength(2)
})
