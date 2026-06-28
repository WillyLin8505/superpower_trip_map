/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

jest.mock('@/lib/utils/clientScheduler', () => ({
  recalcPlan: jest.fn((p) => p),
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
jest.mock('@/components/RecommendPanel', () => ({
  RecommendPanel: () => null,
}))

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
import type { PlanResult } from '@/lib/types'

function plan(): PlanResult {
  return {
    startDate: '2026-06-28', transportMode: 'driving',
    days: [
      { day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [] },
    ],
  }
}

it('shows the trip start–end range and total day count', () => {
  render(<ItineraryClient initial={plan()} />)
  expect((screen.getByTestId('trip-start-date') as HTMLInputElement).value).toBe('2026-06-28')
  expect((screen.getByTestId('trip-end-date') as HTMLInputElement).value).toBe('2026-06-28')
  expect(screen.getByText(/共 1 天/)).toBeInTheDocument()
})

it('extending the end date appends empty days with default window', async () => {
  render(<ItineraryClient initial={plan()} />)
  const end = screen.getByTestId('trip-end-date')
  fireEvent.change(end, { target: { value: '2026-06-30' } }) // 1 → 3 days
  await waitFor(() => expect(screen.getByText(/共 3 天/)).toBeInTheDocument())
  expect(screen.getByText('第 3 天 · 6/30（二）')).toBeInTheDocument()
})

it('each day header shows its date label and editable activity window', () => {
  render(<ItineraryClient initial={plan()} />)
  expect(screen.getByText('第 1 天 · 6/28（日）')).toBeInTheDocument()
  expect(screen.getByDisplayValue('09:00')).toBeInTheDocument()
  expect(screen.getByDisplayValue('21:00')).toBeInTheDocument()
})
