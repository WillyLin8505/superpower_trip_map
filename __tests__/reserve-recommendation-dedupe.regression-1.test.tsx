/** @jest-environment jsdom */
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Candidate, DayRecommendation, Place, PlanResult, ScheduledPlace } from '@/lib/types'

const archivePlace = jest.fn()
const getDayRecommendations = jest.fn()
const computeLegPlan = jest.fn()
const fetchDayArrangeInputs = jest.fn()

jest.mock('@/app/actions/candidates', () => ({
  archiveCandidate: jest.fn(),
  archivePlace: (...args: unknown[]) => archivePlace(...args),
  removeCandidate: jest.fn(),
  unarchivePlace: jest.fn(),
}))

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: (...args: unknown[]) => getDayRecommendations(...args),
  fetchReplacementRecommendation: jest.fn(),
  refreshDayCategoryRecommendations: jest.fn(),
}))

jest.mock('@/app/actions/trips', () => ({
  createTripSafe: jest.fn(async () => ({ ok: true, tripId: 't-created' })),
  saveTripSafe: jest.fn(async () => ({ ok: true })),
}))

jest.mock('@/app/actions/legs', () => ({
  legInfo: jest.fn(),
  computeLegPlan: (...args: unknown[]) => computeLegPlan(...args),
}))

jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: (...args: unknown[]) => fetchDayArrangeInputs(...args),
}))

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
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
jest.mock('@/lib/utils/mapUrl', () => ({ buildDayEmbedUrl: jest.fn(() => null) }))
jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))
jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: () => <button type="button">reserve-search</button>,
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

function place(id: string, name = id): Place {
  return {
    id,
    placeId: id,
    name,
    type: 'attraction',
    lat: 25,
    lng: 121,
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
    reason: 'Google recommendation',
    sourceLabel: 'Google',
  }
}

function plan(): PlanResult {
  return {
    days: [{ day: 1, places: [scheduledPlace('A'), scheduledPlace('B')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving',
    startDate: '2026-07-13',
  }
}

function archivedCandidate(id: string, placeId = id): Candidate {
  return {
    id,
    place: place(placeId),
    addedBy: 'u1',
    addedByName: 'User',
    source: null,
  }
}

function lineCandidate(id: string, placeId = id): Candidate {
  return {
    id,
    place: place(placeId),
    addedBy: 'line-user',
    addedByName: 'Line User',
    source: { kind: 'line_group', lineGroupId: 'g1', messageId: `m-${id}` },
  }
}

function recommendationBuckets(recs: DayRecommendation[]) {
  return [{
    dessert: { shown: recs, reserve: [] },
    attraction: { shown: [], reserve: [] },
    restaurant: { shown: [], reserve: [] },
  }]
}

beforeEach(() => {
  archivePlace.mockReset()
  getDayRecommendations.mockReset()
  computeLegPlan.mockReset()
  fetchDayArrangeInputs.mockReset()
  computeLegPlan.mockResolvedValue([])
  fetchDayArrangeInputs.mockRejectedValue(new Error('arrange skipped in regression test'))
})

it('filters archived places out of recommendations loaded after mount', async () => {
  // Regression: reserve and recommendations displayed the same placeId after recommendations loaded.
  // Found by /qa on 2026-07-13.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-13.md
  getDayRecommendations.mockResolvedValue(recommendationBuckets([recommendation('A')]))

  render(<ItineraryClient initial={plan()} tripId="t1" initialArchived={[archivedCandidate('archived-A', 'A')]} />)

  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalled())
  await waitFor(() => expect(screen.queryByTestId('rec-A')).not.toBeInTheDocument())

  fireEvent.click(within(screen.getByTestId('day-0')).getByTestId('side-panel-tab-reserve'))
  expect(screen.getByTestId('reserve-card-archived-A')).toBeInTheDocument()
  expect(within(screen.getByTestId('reserve-card-archived-A')).getByTestId('rec-A')).toBeInTheDocument()
})

it('filters current itinerary and LINE discussion places out of recommendations loaded after mount', async () => {
  // Regression: recommendations duplicated places already present in my itinerary or LINE discussion.
  // Found by /qa on 2026-07-13.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-13.md
  getDayRecommendations.mockResolvedValue(recommendationBuckets([
    recommendation('A'),
    recommendation('line-place'),
    recommendation('safe-rec'),
  ]))

  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[lineCandidate('line-candidate', 'line-place')]} />)

  await waitFor(() => expect(screen.queryByTestId('rec-A')).not.toBeInTheDocument())
  expect(screen.queryByTestId('rec-line-place')).not.toBeInTheDocument()
  expect(screen.getByTestId('rec-safe-rec')).toBeInTheDocument()
})

it('does not reintroduce an archived itinerary card when stale recommendations finish loading', async () => {
  // Regression: moving a card to reserve while recommendations were loading could let the stale recommendation response show it again.
  // Found by /qa on 2026-07-13.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-13.md
  let resolveRecommendations: (value: ReturnType<typeof recommendationBuckets>) => void = () => undefined
  getDayRecommendations.mockReturnValue(new Promise((resolve) => { resolveRecommendations = resolve }))
  archivePlace.mockResolvedValue({ id: 'archived-A' })

  render(<ItineraryClient initial={plan()} tripId="t1" />)

  fireEvent.click(within(screen.getByTestId('card-A')).getByRole('button', { name: '\u79fb\u5230\u5099\u7528' }))
  fireEvent.click(within(screen.getByTestId('day-0')).getByTestId('side-panel-tab-reserve'))
  expect(screen.getByTestId('reserve-card-pending-A')).toBeInTheDocument()

  await act(async () => {
    resolveRecommendations(recommendationBuckets([recommendation('A')]))
  })

  await waitFor(() => expect(screen.getByTestId('reserve-card-archived-A')).toBeInTheDocument())
  fireEvent.click(within(screen.getByTestId('day-0')).getByTestId('side-panel-tab-recommend'))
  expect(screen.queryByTestId('rec-A')).not.toBeInTheDocument()
})

it('does not call archivePlace again when moving an itinerary card that already exists in reserve', async () => {
  // Regression: clicking save-to-reserve on a place already in reserve re-saved a duplicate.
  // Found by /qa on 2026-07-13.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-13.md
  getDayRecommendations.mockResolvedValue(recommendationBuckets([]))

  render(<ItineraryClient initial={plan()} tripId="t1" initialArchived={[archivedCandidate('archived-A', 'A')]} />)

  fireEvent.click(within(screen.getByTestId('card-A')).getByRole('button', { name: '\u79fb\u5230\u5099\u7528' }))

  await waitFor(() => expect(screen.queryByTestId('card-A')).not.toBeInTheDocument())
  expect(archivePlace).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByTestId('day-0')).getByTestId('side-panel-tab-reserve'))
  expect(screen.getByTestId('reserve-card-archived-A')).toBeInTheDocument()
})
