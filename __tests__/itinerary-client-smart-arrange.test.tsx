/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

// 固定 inputs：A-B 20分, A-C 40分, B-C 20分；B 星期六 10 點 high、13 點 low
const fetchDayArrangeInputs = jest.fn()
jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: (...args: unknown[]) => fetchDayArrangeInputs(...args),
}))

// Keep recalcDay real so arrangeDayOrder works; recalcPlan is identity for simplicity
jest.mock('@/lib/utils/clientScheduler', () => ({
  ...jest.requireActual('@/lib/utils/clientScheduler'),
  recalcPlan: jest.fn((p: unknown) => p),
}))

// ItineraryClient fetches per-day recommendations on mount (pulls in the Anthropic SDK); stub it out
jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn().mockResolvedValue([]),
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

function crowdInputs() {
  const weekly: (number | null)[][] = Array.from({ length: 7 }, () => Array<number | null>(24).fill(0))
  weekly[5][10] = 80; weekly[5][13] = 10
  return {
    indices: ['A', 'B', 'C'],
    matrix: [[0, 1200, 2400], [1200, 0, 1200], [2400, 1200, 0]],
    crowdByPlaceId: { B: { source: 'heuristic' as const, weekly, fetchedAt: '2026-07-01T00:00:00Z' } },
  }
}

beforeEach(() => { fetchDayArrangeInputs.mockReset() })

// Robust helper: reads card order via data-testid="card-<id>" within the day container
function dayOrder(): string[] {
  return within(screen.getByTestId('day-0'))
    .getAllByTestId(/^card-/)
    .map((el) => (el.getAttribute('data-testid') ?? '').replace('card-', ''))
}

it('reorders the day on 智慧排程 (B,A,C to skip B peak) and calls the action with crowd=true', async () => {
  fetchDayArrangeInputs.mockResolvedValue(crowdInputs())
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '智慧排程' }))
  await waitFor(() => expect(dayOrder()).toEqual(['B', 'A', 'C']))
  expect(fetchDayArrangeInputs).toHaveBeenCalledWith(
    expect.any(Array), 'driving', true   // avoidCrowds default true
  )
})

it('shows an error and keeps order when the action rejects', async () => {
  fetchDayArrangeInputs.mockRejectedValue(new Error('boom'))
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '智慧排程' }))
  await waitFor(() => expect(screen.getByText('排程失敗，請稍後再試')).toBeInTheDocument())
  expect(dayOrder()).toEqual(['A', 'B', 'C'])
})

it('unchecking both options disables the button (no call)', async () => {
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByLabelText('避開壅塞'))
  fireEvent.click(screen.getByLabelText('避開人潮'))
  expect(screen.getByRole('button', { name: '智慧排程' })).toBeDisabled()
})
