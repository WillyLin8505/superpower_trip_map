/** @jest-environment jsdom */
import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Candidate, DayRecommendation, Place, PlanResult, RecommendationsByDay, ScheduledPlace } from '@/lib/types'

const archivePlace = jest.fn()
const archiveCandidate = jest.fn()
const removeCandidate = jest.fn()
const unarchivePlace = jest.fn()
const createTripSafe = jest.fn()
const getDayRecommendations = jest.fn()

jest.mock('@/app/actions/candidates', () => ({
  addCandidate: jest.fn(),
  archiveCandidate: (...args: unknown[]) => archiveCandidate(...args),
  removeCandidate: (...args: unknown[]) => removeCandidate(...args),
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
  createTripSafe: (...args: unknown[]) => createTripSafe(...args),
  saveTripSafe: jest.fn(async () => ({ ok: true })),
  listTrips: jest.fn(),
  renameTrip: jest.fn(),
  deleteTrip: jest.fn(),
}))
jest.mock('@/app/actions/arrange', () => ({ fetchDayArrangeInputs: jest.fn() }))
jest.mock('@/app/actions/legs', () => ({ legInfo: jest.fn(), computeLegPlan: jest.fn(async () => []) }))
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
    <button type="button" onClick={() => onAdd(place('np', 'Manual Reserve'))}>pool-add</button>
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

function scheduledPlace(id: string, name = id): ScheduledPlace {
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

function recommendation(id: string, name = id): DayRecommendation {
  return {
    ...place(id, name),
    type: 'dessert',
    reason: 'Recommended',
    sourceLabel: 'Google',
  }
}

function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [scheduledPlace('A'), scheduledPlace('B')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving',
    startDate: '2026-07-04',
  }
}

function recsWithOneRecommendation(): RecommendationsByDay {
  return [{
    dessert: { shown: [recommendation('r1', 'Recommendation A')], reserve: [] },
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

function lineCandidate(id = 'c1'): Candidate {
  return candidate(id, 'LINE Place', { kind: 'line_group', lineGroupId: 'g', messageId: `m-${id}`, messageText: 'looks good' })
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
  archiveCandidate.mockReset()
  removeCandidate.mockReset()
  unarchivePlace.mockReset()
  createTripSafe.mockReset()
  getDayRecommendations.mockReset()
  archiveCandidate.mockResolvedValue({ id: 'c1' })
  removeCandidate.mockResolvedValue(undefined)
  createTripSafe.mockResolvedValue({ ok: true, tripId: 't-created' })
  getDayRecommendations.mockResolvedValue([])
})

it('adds a LINE Bot candidate into the day and removes it from LINE discussion', async () => {
  // Regression: LINE discussion cards were read-only instead of matching recommendation/reserve card actions.
  // Found by /qa on 2026-07-15.
  // Report: .gstack/qa-reports/qa-report-line-candidates-2026-07-15.md
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[lineCandidate()]} />)
  const day = openTab('side-panel-tab-line')

  fireEvent.click(within(day).getByTestId('line-candidate-add-c1'))

  await waitFor(() => expect(removeCandidate).toHaveBeenCalledWith('c1'))
  await waitFor(() => expect(within(day).queryByTestId('line-candidate-card-c1')).not.toBeInTheDocument())
  expect(within(day).getByText('LINE Place')).toBeInTheDocument()
})

it('moves a LINE Bot candidate to reserve and removes it from LINE discussion', async () => {
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[lineCandidate()]} />)
  const day = openTab('side-panel-tab-line')

  fireEvent.click(within(day).getByTestId('line-candidate-archive-c1'))

  await waitFor(() => expect(archiveCandidate).toHaveBeenCalledWith('c1'))
  await waitFor(() => expect(within(day).queryByTestId('line-candidate-card-c1')).not.toBeInTheDocument())
  fireEvent.click(within(day).getByTestId('side-panel-tab-reserve'))
  expect(within(day).getByTestId('reserve-card-c1')).toBeInTheDocument()
})

it('deletes a LINE Bot candidate from LINE discussion', async () => {
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[lineCandidate()]} />)
  const day = openTab('side-panel-tab-line')

  fireEvent.click(within(day).getByTestId('line-candidate-delete-c1'))

  await waitFor(() => expect(removeCandidate).toHaveBeenCalledWith('c1'))
  await waitFor(() => expect(within(day).queryByTestId('line-candidate-card-c1')).not.toBeInTheDocument())
})

it('shows reserve controls on an unsaved searched itinerary and saves before archiving', async () => {
  archivePlace.mockResolvedValue({ id: 'archived-A' })
  render(<ItineraryClient initial={plan()} />)

  fireEvent.click(within(screen.getByTestId('card-A')).getByRole('button', { name: '\u79fb\u5230\u5099\u7528' }))

  await waitFor(() => expect(createTripSafe).toHaveBeenCalled())
  await waitFor(() => expect(archivePlace).toHaveBeenCalledWith('t-created', expect.objectContaining({ id: 'A' })))
  openTab('side-panel-tab-reserve')
  expect(screen.getByTestId('reserve-card-archived-A')).toBeInTheDocument()
})

it('reserve search archives the searched place and renders it as a recommendation-style card', async () => {
  archivePlace.mockResolvedValue({ id: 'np-archived' })
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[]} />)
  const day = openTab('side-panel-tab-reserve')
  fireEvent.click(within(day).getByText('pool-add'))
  await waitFor(() => expect(archivePlace).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Manual Reserve' })))
  expect(await within(day).findByTestId('reserve-card-np-archived')).toBeInTheDocument()
  expect(within(day).getByTestId('rec-np')).toBeInTheDocument()
})

it('reserve card can be added into the day and removed from reserve', async () => {
  unarchivePlace.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" initialArchived={[candidate('r1', 'Reserve A')]} />)
  openTab('side-panel-tab-reserve')
  fireEvent.click(await screen.findByTestId('rec-add-r1'))
  await waitFor(() => expect(unarchivePlace).toHaveBeenCalledWith('r1'))
  expect(dayOrder()).toContain('r1')
  await waitFor(() => expect(screen.queryByTestId('reserve-card-r1')).not.toBeInTheDocument())
})

it('moves an itinerary card to reserve immediately when clicking 移到備用', async () => {
  archivePlace.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ id: 'archived-A' }), 50)))
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  fireEvent.click(within(screen.getByTestId('card-A')).getByRole('button', { name: '\u79fb\u5230\u5099\u7528' }))

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
  fireEvent.click(within(screen.getByTestId('rec-r1')).getByRole('button', { name: '\u79fb\u5230\u5099\u7528' }))

  expect(screen.queryByTestId('rec-r1')).not.toBeInTheDocument()
  openTab('side-panel-tab-reserve')
  expect(screen.getByTestId('reserve-card-pending-r1')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId('reserve-card-archived-r1')).toBeInTheDocument())
})
