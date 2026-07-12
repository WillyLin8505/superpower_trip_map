/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

// --- mocks reused from itinerary-client-smart-arrange.test.tsx ---

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
  buildDayEmbedUrl: jest.fn(() => null), buildPlaceMapsUrl: jest.fn(() => 'https://maps.google.com/maps/search/?api=1&query=test'),
}))

jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

// --- leg-specific mock ---

const legInfo = jest.fn()
jest.mock('@/app/actions/legs', () => ({
  legInfo: (...a: unknown[]) => legInfo(...a),
  computeLegPlan: jest.fn(async () => []),
}))

// --- helpers ---

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 18, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, legMode: 'driving', ...over }
}

function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [sp('A'), sp('B', { travelMinToNext: null, legMode: undefined })],
      aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving', startDate: '2026-07-01',
  }
}

beforeEach(() => { legInfo.mockReset() })

it('changing a leg mode calls legInfo and updates the leg (min + km)', async () => {
  legInfo.mockResolvedValue({ travelMin: 25, travelDistanceM: 6300 })
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getAllByLabelText('交通工具')[0], { target: { value: 'transit' } })
  await waitFor(() => expect(screen.getByText(/大眾運輸 25 分 · 6\.3 公里/)).toBeInTheDocument())
  expect(legInfo).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'A' }), expect.objectContaining({ id: 'B' }), 'transit'
  )
})

it('shows an error and keeps the leg when legInfo rejects', async () => {
  legInfo.mockRejectedValue(new Error('boom'))
  render(<ItineraryClient initial={plan()} />)
  fireEvent.change(screen.getAllByLabelText('交通工具')[0], { target: { value: 'walking' } })
  await waitFor(() => expect(screen.getByText('交通時間計算失敗')).toBeInTheDocument())
  expect(screen.getByText(/開車 18 分/)).toBeInTheDocument()
})
