/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

// ---- mocks copied from itinerary-client-smart-arrange.test.tsx ----

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

jest.mock('@/app/actions/trips', () => ({
  createTrip: jest.fn(),
  saveTrip: jest.fn(),
  getTrip: jest.fn(),
  listTrips: jest.fn(),
  renameTrip: jest.fn(),
  deleteTrip: jest.fn(),
}))

jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: jest.fn(),
}))

jest.mock('@/lib/utils/clientScheduler', () => ({
  ...jest.requireActual('@/lib/utils/clientScheduler'),
  recalcPlan: jest.fn((p: unknown) => p),
}))

// dnd-kit: pass children straight through
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

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn().mockResolvedValue([]),
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

// ---- stub AiRearrangeInput: a button that calls onApply with a plan whose day 1 has only A ----
jest.mock('@/components/AiRearrangeInput', () => ({
  AiRearrangeInput: ({ onApply, plan }: { onApply: (p: PlanResult) => void; plan: PlanResult }) => (
    <button onClick={() => onApply({ ...plan, days: plan.days.map((d, i) =>
      i === 0 ? { ...d, places: d.places.filter((p) => p.placeId === 'A') } : d) })}>stub-apply</button>
  ),
}))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function d(day: number, places: ScheduledPlace[]): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
function plan(): PlanResult {
  return { days: [d(1, [sp('A'), sp('B')]), d(2, [sp('C')])], transportMode: 'driving', startDate: '2026-07-10' }
}

it('applying an AI rearrange updates the itinerary (B removed from day 1)', () => {
  render(<ItineraryClient initial={plan()} />)
  // day 1 initially shows both A and B
  expect(screen.getByTestId('card-B')).toBeInTheDocument()
  fireEvent.click(screen.getByText('stub-apply'))
  // after apply, day-1 no longer has B
  const day0 = screen.getByTestId('day-0')
  expect(day0.querySelector('[data-testid="card-B"]')).toBeNull()
})
