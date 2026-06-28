/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { PlanResult } from '@/lib/types'

// ── clientScheduler: mock recalcPlan so we can assert it is never called ──────
jest.mock('@/lib/utils/clientScheduler', () => ({
  recalcPlan: jest.fn((p: PlanResult) => p),
}))

// ── Next.js navigation (transitive deps of sub-components) ──────────────────
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// ── dnd-kit: DndContext and SortableContext pass children straight through ──
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

// ── Heavy / unrelated sub-components stubbed out ────────────────────────────
jest.mock('@/components/RecommendPanel', () => ({
  RecommendPanel: () => null,
}))

jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: () => null,
}))

// ── Utility modules ──────────────────────────────────────────────────────────
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
  getTodayHours: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

// ── TimeScrollPicker: render value as text so we can assert times ────────────
jest.mock('@/components/TimeScrollPicker', () => ({
  TimeScrollPicker: ({ value }: { value: string }) => (
    <span data-testid="time-display">{value}</span>
  ),
}))

// ── Imports (after all jest.mock calls) ─────────────────────────────────────
import { recalcPlan } from '@/lib/utils/clientScheduler'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

const recalcMock = recalcPlan as jest.MockedFunction<typeof recalcPlan>

// ── Fixture: one day, one unlocked attraction at 10:00 for 90 min ────────────
const INITIAL: PlanResult = {
  days: [
    {
      day: 1,
      aiSummary: null,
      places: [
        {
          id: 'p1',
          placeId: 'g1',
          name: '某景點',
          type: 'attraction',
          lat: 0,
          lng: 0,
          address: '地址',
          openingHours: null,
          rating: null,
          photoUrl: null,
          description: null,
          startTime: '10:00',
          durationMin: 90,
          travelMinToNext: null,
          aiDescription: null,
          outsideHours: false,
          lateExit: false,
          timeLocked: false,
        },
      ],
    },
  ],
  transportMode: 'driving',
}

afterEach(() => {
  jest.useRealTimers()
  recalcMock.mockClear()
})

describe('ItineraryClient — handleChangeType', () => {
  it('changing a place type does NOT call recalcPlan, even after 2500 ms', async () => {
    jest.useFakeTimers()

    render(<ItineraryClient initial={INITIAL} />)

    // Open the TypePicker for the attraction (trigger text: "🏔 景點 ▾")
    fireEvent.click(screen.getByRole('button', { name: /景點/ }))
    // Pick accommodation
    fireEvent.click(screen.getByText('🏨 住宿'))

    // Advance past the debounce threshold used by scheduleRecalc (2000 ms)
    await act(async () => {
      jest.advanceTimersByTime(2500)
    })

    expect(recalcMock).not.toHaveBeenCalled()
  })

  it('displayed start → end time is unchanged after type change (10:00 → 11:30)', () => {
    render(<ItineraryClient initial={INITIAL} />)

    // Confirm initial time display
    const before = screen.getAllByTestId('time-display')
    expect(before[0]).toHaveTextContent('10:00')
    expect(before[1]).toHaveTextContent('11:30')

    // Change type from 景點 to 住宿
    fireEvent.click(screen.getByRole('button', { name: /景點/ }))
    fireEvent.click(screen.getByText('🏨 住宿'))

    // Times must be unaffected — handleChangeType does NOT touch startTime / durationMin
    const after = screen.getAllByTestId('time-display')
    expect(after[0]).toHaveTextContent('10:00')
    expect(after[1]).toHaveTextContent('11:30')
  })
})
