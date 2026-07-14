/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { PlanResult } from '@/lib/types'

// ── clientScheduler: mock recalcPlan so we can assert the edit bypasses it ───
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
  buildPlaceMapsUrl: jest.fn(() => null),
}))

jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

// Real TimeScrollPicker is used (not mocked) — we open it and click a minute
// cell to trigger a genuine onChange, closest to real user interaction.

import { recalcPlan } from '@/lib/utils/clientScheduler'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

const recalcMock = recalcPlan as jest.MockedFunction<typeof recalcPlan>

function place(id: string, startTime: string, durationMin: number) {
  return {
    id, placeId: id, name: id, type: 'attraction' as const, lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime,
    durationMin, travelMinToNext: 0, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false,
  }
}

// A 09:00-10:00 -> B 10:00-11:00 -> C 11:00-12:00 (travel 0 throughout)
const INITIAL: PlanResult = {
  days: [
    {
      day: 1,
      aiSummary: null,
      dayStart: '09:00',
      dayEnd: '21:00',
      places: [place('A', '09:00', 60), place('B', '10:00', 60), place('C', '11:00', 60)],
    },
  ],
  transportMode: 'driving',
  startDate: '2026-06-01',
}

afterEach(() => {
  recalcMock.mockClear()
})

describe('ItineraryClient — edit-time cascade wiring (TASK-023)', () => {
  it('dragging B\'s start later aligns A\'s end, cascades C forward, and never calls recalcPlan', () => {
    render(<ItineraryClient initial={INITIAL} />)

    const cardB = screen.getByTestId('card-B')
    // Within card B, the first time-scroll-picker is the start facet (the second is the end facet).
    const startPicker = within(cardB).getAllByTestId('time-scroll-picker')[0]

    // Open the picker and move the minute to 30 (hour stays 10) → B starts at 10:30.
    fireEvent.click(within(startPicker).getByRole('button', { name: '10:00' }))
    fireEvent.click(within(startPicker).getByTestId('minutes-col').getElementsByTagName('li')[6]) // '30'

    // B's own start moved, and the edit stuck (no snap-back to the pre-edit value).
    expect(within(cardB).getByRole('button', { name: '10:30' })).toBeInTheDocument()

    // A's duration extended so its end (09:00 + 90 = 10:30) aligns with B's new start.
    const cardA = screen.getByTestId('card-A')
    expect(within(cardA).getByLabelText('停留分鐘')).toHaveValue(90)

    // C follows forward from B's new end (10:30 + 60 = 11:30).
    const cardC = screen.getByTestId('card-C')
    expect(within(cardC).getByRole('button', { name: '11:30' })).toBeInTheDocument()

    // The edit bypasses the debounced recalcPlan pipeline entirely.
    expect(recalcMock).not.toHaveBeenCalled()
  })
})
