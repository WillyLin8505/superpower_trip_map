/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/app/actions/trips', () => ({
  createTrip: jest.fn(), saveTrip: jest.fn(), getTrip: jest.fn(),
  listTrips: jest.fn(), renameTrip: jest.fn(), deleteTrip: jest.fn(),
}))
jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: jest.fn(),
}))

// Keep the scheduler real for ordering; recalcPlan is identity for simplicity
jest.mock('@/lib/utils/clientScheduler', () => ({
  ...jest.requireActual('@/lib/utils/clientScheduler'),
  recalcPlan: jest.fn((p: unknown) => p),
}))

// ItineraryClient fetches per-day recommendations on mount (pulls in the SDK); stub it
jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn().mockResolvedValue([]),
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

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}
function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [sp('A'), sp('B'), sp('C')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving', startDate: '2026-07-04',
  }
}
function dayOrder(): string[] {
  return within(screen.getByTestId('day-0'))
    .getAllByTestId(/^card-/)
    .map((el) => (el.getAttribute('data-testid') ?? '').replace('card-', ''))
}

it('deletes a single place when its 刪除地點 button is clicked', async () => {
  render(<ItineraryClient initial={plan()} />)
  expect(dayOrder()).toEqual(['A', 'B', 'C'])
  fireEvent.click(within(screen.getByTestId('card-B')).getByRole('button', { name: '刪除地點' }))
  await waitFor(() => expect(dayOrder()).toEqual(['A', 'C']))
})
