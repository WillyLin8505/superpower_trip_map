/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

jest.mock('@/lib/utils/clientScheduler', () => ({
  recalcPlan: jest.fn((p) => p),
}))

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

function planWithDays(n: number): PlanResult {
  return {
    startDate: '2026-06-28', transportMode: 'driving',
    days: Array.from({ length: n }, (_, i) => ({
      day: i + 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', places: [],
    })),
  }
}

it('clicking ▲ appends an empty day', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-up'))
  await waitFor(() => expect(screen.getByText(/共 2 天/)).toBeInTheDocument())
  expect(screen.getByText('第 2 天 · 6/29（一）')).toBeInTheDocument()
})

it('clicking ▼ sets a pending target and shows the overCount banner without deleting days', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（2），請處理超出的天。')).toBeInTheDocument()
  )
  expect(screen.getByText(/共 3 天/)).toBeInTheDocument() // unchanged — no auto-delete
})

it('clicking ▼ repeatedly keeps decrementing the pending target (not stuck after one click)', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（2），請處理超出的天。')).toBeInTheDocument()
  )
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（1），請處理超出的天。')).toBeInTheDocument()
  )
  expect(screen.getByTestId('day-count-stepper-down')).toBeDisabled() // floor reached
})

it('clicking ▲ after a pending shrink cancels it instead of growing past the real day count', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（2），請處理超出的天。')).toBeInTheDocument()
  )
  fireEvent.click(screen.getByTestId('day-count-stepper-up'))
  await waitFor(() =>
    expect(screen.queryByText(/行程天數（3）大於設定天數/)).not.toBeInTheDocument()
  )
  expect(screen.getByText(/共 3 天/)).toBeInTheDocument() // still 3 — target reset to match, no day appended
})

// --- TASK-015: bottom add-day and scroll-to-top buttons ---
it('clicking bottom "+ 加一天" appends an empty day, same as the top ▲', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('bottom-add-day'))
  await waitFor(() => expect(screen.getByText(/共 4 天/)).toBeInTheDocument())
  expect(screen.getByText('第 4 天 · 7/1（三）')).toBeInTheDocument()
})

it('clicking bottom "+ 加一天" while a shrink is pending cancels it, same as the top ▲', async () => {
  render(<ItineraryClient initial={planWithDays(3)} />)
  fireEvent.click(screen.getByTestId('day-count-stepper-down'))
  await waitFor(() =>
    expect(screen.getByText('行程天數（3）大於設定天數（2），請處理超出的天。')).toBeInTheDocument()
  )
  fireEvent.click(screen.getByTestId('bottom-add-day'))
  await waitFor(() =>
    expect(screen.queryByText(/行程天數（3）大於設定天數/)).not.toBeInTheDocument()
  )
  expect(screen.getByText(/共 3 天/)).toBeInTheDocument()
})

it('clicking "↑ 回到頂部" calls window.scrollTo(0,0) smoothly', () => {
  const scrollToMock = jest.fn()
  window.scrollTo = scrollToMock
  render(<ItineraryClient initial={planWithDays(2)} />)
  fireEvent.click(screen.getByTestId('scroll-to-top'))
  expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
})

it('bottom add-day and scroll-to-top buttons carry the correct accessible labels', () => {
  render(<ItineraryClient initial={planWithDays(1)} />)
  expect(screen.getByTestId('bottom-add-day')).toHaveAccessibleName('增加一天')
  expect(screen.getByTestId('scroll-to-top')).toHaveAccessibleName('回到頂部')
})
