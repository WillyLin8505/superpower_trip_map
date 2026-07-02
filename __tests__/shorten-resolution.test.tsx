/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

jest.mock('@/lib/utils/clientScheduler', () => ({ recalcPlan: jest.fn((p) => p) }))

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn().mockResolvedValue([]),
}))

// Next.js navigation (transitive deps)
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

// Heavy / unrelated sub-components stubbed out
jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: () => null,
}))

// Utility modules
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
import type { PlanResult, ScheduledPlace } from '@/lib/types'

function sp(id: string, lat: number, lng: number): ScheduledPlace {
  return { id, placeId: 'g'+id, name: id, type: 'attraction', lat, lng, address: 'a',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false }
}
function plan(): PlanResult {
  return { startDate: '2026-06-28', transportMode: 'driving', days: [
    { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [sp('a', 25.0, 121.5)] },
    { day: 2, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [sp('b', 25.1, 121.6)] },
  ] }
}

it('shows the over-count warning after shortening below populated days', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getByTestId('trip-end-date'), { target: { value: '2026-06-28' } }) // N=1, M=2
  await waitFor(() => expect(screen.getByText(/大於設定天數/)).toBeInTheDocument())
})

it('delete removes the over-count day', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getByTestId('trip-end-date'), { target: { value: '2026-06-28' } })
  await waitFor(() => screen.getByText(/大於設定天數/))
  fireEvent.click(screen.getByRole('button', { name: '刪除這天' }))
  await waitFor(() => expect(screen.queryByText('b')).not.toBeInTheDocument())
})

it('scatter moves the over-count day\'s places into the nearest kept day and removes the day', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getByTestId('trip-end-date'), { target: { value: '2026-06-28' } })
  await waitFor(() => screen.getByText(/大於設定天數/))
  fireEvent.click(screen.getByRole('button', { name: '散到其他天' }))
  // 'b' moved into day 1; only one day remains
  await waitFor(() => expect(screen.queryAllByTestId(/^day-/)).toHaveLength(1))
  expect(screen.getByText('b')).toBeInTheDocument()
})
