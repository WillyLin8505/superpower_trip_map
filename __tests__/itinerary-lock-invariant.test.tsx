/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { PlanResult } from '@/lib/types'

// ── clientScheduler: mock recalcPlan so we can assert it is never called ──────
jest.mock('@/lib/utils/clientScheduler', () => ({
  recalcPlan: jest.fn((p: PlanResult) => p),
}))

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn().mockResolvedValue([]),
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
  getHoursForDate: jest.fn(() => null),
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
      dayStart: '09:00',
      dayEnd: '21:00',
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
          startLocked: false,
          durationLocked: false,
        },
      ],
    },
  ],
  transportMode: 'driving',
  startDate: '2026-06-01',
}

afterEach(() => {
  jest.useRealTimers()
  recalcMock.mockClear()
})

describe('ItineraryClient — lock-toggle invariant', () => {
  it('toggling the start lock does NOT reschedule and does NOT change startTime', async () => {
    jest.useFakeTimers()
    render(<ItineraryClient initial={INITIAL} />)

    // Start time visible before locking
    expect(screen.getByText('10:00')).toBeInTheDocument()

    // Click the per-card start lock (aria-label 鎖定開始時間)
    fireEvent.click(screen.getByRole('button', { name: '鎖定開始時間' }))

    // Advance past the debounce threshold used by scheduleRecalc (2000 ms)
    await act(async () => {
      jest.advanceTimersByTime(2500)
    })

    // recalcPlan must never fire for a lock toggle
    expect(recalcMock).not.toHaveBeenCalled()
    // start time unchanged (now shown as static text, still 10:00)
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('toggling the duration lock does NOT reschedule and does NOT change times', async () => {
    jest.useFakeTimers()
    render(<ItineraryClient initial={INITIAL} />)

    // Both start (10:00) and end (11:30) visible
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('11:30')).toBeInTheDocument()

    // Click the per-card duration lock (aria-label 鎖定停留時間)
    fireEvent.click(screen.getByRole('button', { name: '鎖定停留時間' }))

    await act(async () => {
      jest.advanceTimersByTime(2500)
    })

    expect(recalcMock).not.toHaveBeenCalled()
    // times unchanged: start still editable (10:00), end now static (11:30)
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.getByText('11:30')).toBeInTheDocument()
  })
})
