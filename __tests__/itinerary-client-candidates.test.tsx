/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { DayRecommendation, PlanResult, ScheduledPlace, Candidate, Place, RecommendationsByDay } from '@/lib/types'

const archivePlace = jest.fn()
const unarchivePlace = jest.fn()
const getDayRecommendations = jest.fn()

jest.mock('@/app/actions/candidates', () => ({
  addCandidate: jest.fn(),
  removeCandidate: jest.fn(),
  listCandidates: jest.fn(),
  archivePlace: (...args: unknown[]) => archivePlace(...args),
  unarchivePlace: (...args: unknown[]) => unarchivePlace(...args),
}))

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: (...args: unknown[]) => getDayRecommendations(...args),
  fetchReplacementRecommendation: jest.fn(),
  refreshDayCategoryRecommendations: jest.fn(),
}))

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/app/actions/trips', () => ({
  createTrip: jest.fn(),
  saveTrip: jest.fn(async () => undefined),
  getTrip: jest.fn(),
  createTripSafe: jest.fn(),
  saveTripSafe: jest.fn(async () => ({ ok: true })),
  listTrips: jest.fn(),
  renameTrip: jest.fn(),
  deleteTrip: jest.fn(),
}))
jest.mock('@/app/actions/arrange', () => ({ fetchDayArrangeInputs: jest.fn() }))
jest.mock('@/lib/utils/clientScheduler', () => ({
  ...jest.requireActual('@/lib/utils/clientScheduler'),
  recalcPlan: jest.fn((plan: unknown) => plan),
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
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))
jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (place: Place) => void }) => (
    <button onClick={() => onAdd(place('np', '新備用'))}>pool-add</button>
  ),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

function place(id: string, name: string): Place {
  return {
    id,
    placeId: id,
    name,
    type: 'attraction',
    lat: 0,
    lng: 0,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
  }
}

function sp(id: string, name = id): ScheduledPlace {
  return {
    ...place(id, name),
    startTime: '09:00',
    durationMin: 60,
    travelMinToNext: null,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    startLocked: false,
    durationLocked: false,
  }
}

function rec(id: string, name = id): DayRecommendation {
  return {
    ...place(id, name),
    type: 'dessert',
    reason: '推薦理由',
    sourceLabel: 'Google 推薦',
  }
}

function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [sp('A'), sp('B')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving',
    startDate: '2026-07-04',
  }
}

function recsWithOneRecommendation(): RecommendationsByDay {
  return [{
    dessert: { shown: [rec('r1', '推薦A')], reserve: [] },
    attraction: { shown: [], reserve: [] },
    restaurant: { shown: [], reserve: [] },
  }]
}

function candidate(id: string, name: string, source: Candidate['source'] = null): Candidate {
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
    .map((element) => (element.getAttribute('data-testid') ?? '').replace('card-', ''))
}

beforeEach(() => {
  archivePlace.mockReset()
  unarchivePlace.mockReset()
  getDayRecommendations.mockReset()
  getDayRecommendations.mockResolvedValue([])
})

it('renders LINE Bot candidates only in the read-only LINE tab', () => {
  render(
    <ItineraryClient
      initial={plan()}
      tripId="t1"
      initialCandidates={[candidate('c1', '台北101', { kind: 'line_group', lineGroupId: 'g', messageId: 'm', messageText: '去這裡' })]}
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
  render(<ItineraryClient initial={plan()} tripId="t1" initialArchived={[candidate('r1', '備用A')]} />)
  openTab('side-panel-tab-reserve')
  fireEvent.click(await screen.findByTestId('rec-add-r1'))
  await waitFor(() => expect(unarchivePlace).toHaveBeenCalledWith('r1'))
  expect(dayOrder()).toContain('r1')
  await waitFor(() => expect(screen.queryByTestId('reserve-card-r1')).not.toBeInTheDocument())
})

it('moves an itinerary card to reserve immediately when clicking 移到備用', async () => {
  archivePlace.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ id: 'archived-A' }), 50)))
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  fireEvent.click(within(screen.getByTestId('card-A')).getByLabelText('移到備用'))

  expect(screen.queryByTestId('card-A')).not.toBeInTheDocument()
  openTab('side-panel-tab-reserve')
  expect(screen.getByTestId('reserve-card-pending-A')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId('reserve-card-archived-A')).toBeInTheDocument())
})

it('moves a recommendation card to reserve immediately when clicking 移到備用', async () => {
  getDayRecommendations.mockResolvedValue(recsWithOneRecommendation())
  archivePlace.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ id: 'archived-r1' }), 50)))
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  await screen.findByTestId('rec-r1')
  fireEvent.click(within(screen.getByTestId('rec-r1')).getByLabelText('移到備用'))

  expect(screen.queryByTestId('rec-r1')).not.toBeInTheDocument()
  openTab('side-panel-tab-reserve')
  expect(screen.getByTestId('reserve-card-pending-r1')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId('reserve-card-archived-r1')).toBeInTheDocument())
})
