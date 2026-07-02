/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn(),
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
import { getDayRecommendations } from '@/app/actions/recommend'
import type { PlanResult, RecommendationsByDay } from '@/lib/types'

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
  dessert: [{
    id: 'd1', placeId: 'd1', name: '推薦甜點', type: 'dessert', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, reason: '好吃', sourceLabel: '部落格',
  }],
  attraction: [], restaurant: [],
}]

beforeEach(() => {
  jest.clearAllMocks()
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recs)
})

it('loads day recommendations on mount and adds to that day on arrow click', async () => {
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  const addBtn = await screen.findByTestId('rec-add-d1')
  fireEvent.click(addBtn)

  // card disappears after add
  await waitFor(() => expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument())
  // added place now shows in the itinerary
  expect(screen.getByText('推薦甜點')).toBeInTheDocument()
})
