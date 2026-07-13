/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { PlanResult, ScheduledPlace, Candidate, Place } from '@/lib/types'

const archivePlace = jest.fn()
const unarchivePlace = jest.fn()
jest.mock('@/app/actions/candidates', () => ({
  addCandidate: jest.fn(),
  removeCandidate: jest.fn(),
  listCandidates: jest.fn(),
  archivePlace: (...a: unknown[]) => archivePlace(...a),
  unarchivePlace: (...a: unknown[]) => unarchivePlace(...a),
}))

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/app/actions/trips', () => ({
  createTrip: jest.fn(), saveTrip: jest.fn(async () => undefined), getTrip: jest.fn(),
  createTripSafe: jest.fn(), saveTripSafe: jest.fn(async () => ({ ok: true })),
  listTrips: jest.fn(), renameTrip: jest.fn(), deleteTrip: jest.fn(),
}))
jest.mock('@/app/actions/arrange', () => ({ fetchDayArrangeInputs: jest.fn() }))
jest.mock('@/lib/utils/clientScheduler', () => ({
  ...jest.requireActual('@/lib/utils/clientScheduler'),
  recalcPlan: jest.fn((p: unknown) => p),
}))
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
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: jest.fn(), transform: null, transition: null, isDragging: false }),
}))
jest.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }))
jest.mock('@/lib/utils/geo', () => ({ findClosestDay: jest.fn(() => 0) }))
jest.mock('@/lib/utils/dragContainers', () => ({ applyDragResult: jest.fn(), findContainer: jest.fn(() => -1) }))
jest.mock('@/lib/utils/mapUrl', () => ({ buildDayEmbedUrl: jest.fn(() => null) }))
jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null), checkOutsideHours: jest.fn(() => false), checkLateExit: jest.fn(() => false),
}))
jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (p: Place) => void }) => (
    <button onClick={() => onAdd(place('np', '新備用'))}>pool-add</button>
  ),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

function place(id: string, name: string): Place {
  return {
    id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
  }
}

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    ...place(name, name),
    startTime: '09:00',
    durationMin: 60,
    travelMinToNext: null,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    startLocked: false,
    durationLocked: false,
    ...over,
  }
}

function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [sp('A'), sp('B')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving', startDate: '2026-07-04',
  }
}

function cand(id: string, name: string, source: Candidate['source'] = null): Candidate {
  return {
    id,
    addedBy: 'u2',
    addedByName: 'Mina',
    source,
    place: place(id, name),
  }
}

function openTab(testId: string, dayIdx = 0) {
  const day = screen.getByTestId(`day-${dayIdx}`)
  fireEvent.click(within(day).getByTestId(testId))
  return day
}

function dayOrder(): string[] {
  return within(screen.getByTestId('day-0'))
    .getAllByTestId(/^card-/)
    .map((el) => (el.getAttribute('data-testid') ?? '').replace('card-', ''))
}

beforeEach(() => {
  archivePlace.mockReset()
  unarchivePlace.mockReset()
})

it('renders LINE Bot candidates only in the read-only LINE tab', () => {
  render(
    <ItineraryClient
      initial={plan()}
      tripId="t1"
      initialCandidates={[cand('c1', '台北101', { kind: 'line_group', lineGroupId: 'g', messageId: 'm', messageText: '去這裡' })]}
    />,
  )
  const day = openTab('side-panel-tab-line')
  expect(within(day).getByText('LINE 討論的行程')).toBeInTheDocument()
  expect(within(day).getByText('台北101')).toBeInTheDocument()
  expect(within(day).queryByTestId('rec-add-c1')).not.toBeInTheDocument()
})

it('reserve search archives the searched place and renders it as a recommendation-style card', async () => {
  archivePlace.mockResolvedValue({ id: 'np-archived' })
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[]} />)
  const day = openTab('side-panel-tab-reserve')
  fireEvent.click(within(day).getByText('pool-add'))
  await waitFor(() => expect(archivePlace).toHaveBeenCalledWith('t1', expect.objectContaining({ name: '新備用' })))
  expect(await within(day).findByTestId('reserve-card-np-archived')).toBeInTheDocument()
  expect(within(day).getByTestId('rec-np')).toBeInTheDocument()
})

it('reserve card can be added into the day and removed from reserve', async () => {
  unarchivePlace.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" initialArchived={[cand('r1', '備用A')]} />)
  openTab('side-panel-tab-reserve')
  fireEvent.click(await screen.findByTestId('rec-add-r1'))
  await waitFor(() => expect(unarchivePlace).toHaveBeenCalledWith('r1'))
  expect(dayOrder()).toContain('r1')
  await waitFor(() => expect(screen.queryByTestId('reserve-card-r1')).not.toBeInTheDocument())
})
