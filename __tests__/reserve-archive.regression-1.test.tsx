/** @jest-environment jsdom */
import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { Candidate, DayRecommendation, Place, PlanResult, ScheduledPlace } from '@/lib/types'

const archivePlace = jest.fn()
const createTripSafe = jest.fn()
const getDayRecommendations = jest.fn()
const computeLegPlan = jest.fn()
const fetchDayArrangeInputs = jest.fn()
const realFetch = global.fetch
const reserveGooglePlaceId = 'ChIJreserveplace1234567890'

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
  createTripSafe: (...args: unknown[]) => createTripSafe(...args),
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
import { ItineraryCard } from '@/components/ItineraryCard'
import { RecommendationCard } from '@/components/RecommendationCard'
import { SidePanel } from '@/components/SidePanel'
import type { SidePanelTab } from '@/components/SidePanel'

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
    reason: 'Test reason',
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

function candidate(id: string, placeId = id): Candidate {
  return {
    id,
    place: { ...place(placeId, id), id },
    addedBy: 'u1',
    addedByName: 'User',
    source: null,
  }
}

function sidePanelProps() {
  return {
    dateIso: '2026-07-04',
    recommendations: {
      dessert: { shown: [], reserve: [] },
      attraction: { shown: [], reserve: [] },
      restaurant: { shown: [], reserve: [] },
    },
    onAddRecommendation: jest.fn(),
    candidates: [] as Candidate[],
    archived: [candidate('reserve-a', reserveGooglePlaceId)],
    onAddReservePlace: jest.fn(),
    onAddReservePlaces: jest.fn(),
    onAddArchivedToDay: jest.fn(),
    onDeleteArchived: jest.fn(),
    onAddCandidateToDay: jest.fn(),
    onArchiveCandidate: jest.fn(),
    onDeleteCandidate: jest.fn(),
  }
}

beforeEach(() => {
  archivePlace.mockReset()
  createTripSafe.mockReset()
  getDayRecommendations.mockReset()
  computeLegPlan.mockReset()
  fetchDayArrangeInputs.mockReset()
  createTripSafe.mockResolvedValue({ ok: true, tripId: 't-created' })
  getDayRecommendations.mockResolvedValue([])
  computeLegPlan.mockResolvedValue([])
  fetchDayArrangeInputs.mockRejectedValue(new Error('arrange skipped in regression test'))
  window.sessionStorage.clear()
})

afterEach(() => {
  global.fetch = realFetch
})

it('uses a visible save icon while preserving the archive accessible name', () => {
  const onArchive = jest.fn()
  render(<ItineraryCard place={scheduledPlace('A')} index={0} dateIso="2026-07-04" onArchive={onArchive} />)

  const button = screen.getByRole('button', { name: '\u79fb\u5230\u5099\u7528' })
  expect(button).toHaveTextContent('\uD83D\uDCBE')
  expect(button).toHaveAttribute('title', '\u79fb\u5230\u5099\u7528')

  render(<RecommendationCard rec={recommendation('R')} dateIso="2026-07-04" onArchive={onArchive} />)
  expect(screen.getAllByRole('button', { name: '\u79fb\u5230\u5099\u7528' })[1]).toHaveTextContent('\uD83D\uDCBE')
})

function ControlledSidePanelHarness() {
  const [tab, setTab] = React.useState<SidePanelTab | undefined>(undefined)
  const [mounted, setMounted] = React.useState(true)
  return (
    <>
      <button type="button" onClick={() => setMounted((value) => !value)}>toggle-panel</button>
      {mounted && <SidePanel {...sidePanelProps()} activeTab={tab} onTabChange={setTab} />}
    </>
  )
}

function ReservePhotoHarness() {
  const [version, setVersion] = React.useState(0)
  return (
    <>
      <button type="button" onClick={() => setVersion((value) => value + 1)}>rerender-reserve</button>
      <span data-testid="reserve-photo-version">{version}</span>
      <SidePanel {...sidePanelProps()} />
    </>
  )
}

it('restores the reserve tab after the controlled SidePanel remounts', async () => {
  render(<ControlledSidePanelHarness />)
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))
  expect(screen.getByTestId('reserve-card-reserve-a')).toBeInTheDocument()

  fireEvent.click(screen.getByText('toggle-panel'))
  expect(screen.queryByTestId('side-panel')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('toggle-panel'))

  await waitFor(() => expect(screen.getByTestId('reserve-card-reserve-a')).toBeInTheDocument())
  expect(screen.getByTestId('reserve-panel')).toBeInTheDocument()
})

it('keeps fetched photos available in the reserve-card lightbox after parent rerenders', async () => {
  // Regression: ISSUE-002 - reserve cards used the recommendation card layout, but fetched photos were cleared by parent rerenders.
  // Found by /qa on 2026-07-13.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-13.md
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      photoUrls: ['/api/photo?ref=reserve-one', '/api/photo?ref=reserve-two'],
    }),
  })
  global.fetch = fetchMock as unknown as typeof fetch

  render(<ReservePhotoHarness />)
  fireEvent.click(screen.getByTestId('side-panel-tab-reserve'))

  expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
  expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=reserve-one')
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/place-photos?placeId=${reserveGooglePlaceId}&limit=1`))

  fireEvent.click(screen.getByText('rerender-reserve'))

  await waitFor(() => expect(screen.getByTestId('reserve-photo-version')).toHaveTextContent('1'))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=reserve-one')

  fireEvent.click(screen.getByTestId('photo-thumb-0'))
  fireEvent.click(screen.getByTestId('photo-next'))

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByAltText('reserve-a 照片 2')).toHaveAttribute('src', '/api/photo?ref=reserve-two'))
})

it('keeps recommendation photoUrls when adding a recommendation into my itinerary', async () => {
  // Regression: ISSUE-003 - recommendation cards had images, but the itinerary card lost photoUrls during add-to-day conversion.
  // Found by /qa on 2026-07-13.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-13.md
  getDayRecommendations.mockResolvedValue([
    {
      dessert: {
        shown: [
          {
            ...recommendation('photo-rec', 'Photo Recommendation'),
            photoUrl: null,
            photoUrls: ['/api/photo?ref=itinerary-one', '/api/photo?ref=itinerary-two'],
          },
        ],
        reserve: [],
      },
      attraction: { shown: [], reserve: [] },
      restaurant: { shown: [], reserve: [] },
    },
  ])

  render(<ItineraryClient initial={plan()} />)

  fireEvent.click(await screen.findByTestId('rec-add-photo-rec'))

  let itineraryCard: Element | null = null
  await waitFor(() => {
    itineraryCard = screen
      .getAllByText('Photo Recommendation')
      .map((element) => element.closest('[data-testid^="card-"]'))
      .find((element): element is Element => element !== null) ?? null
    expect(itineraryCard).not.toBeNull()
  })
  expect(within(itineraryCard as HTMLElement).getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=itinerary-one')
  fireEvent.click(within(itineraryCard as HTMLElement).getByTestId('photo-thumb-0'))
  fireEvent.click(screen.getByTestId('photo-next'))
  await waitFor(() => expect(screen.getByAltText('Photo Recommendation 照片 2')).toHaveAttribute('src', '/api/photo?ref=itinerary-two'))
})

it('keeps an archived itinerary card visible after the delayed route recalculation', async () => {
  // Regression: ISSUE-001 - archived card appeared in reserve, then disappeared after the delayed recalculation.
  // Found by /qa on 2026-07-13.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-13.md
  archivePlace.mockResolvedValue({ id: 'archived-A' })
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  fireEvent.click(within(screen.getByTestId('card-A')).getByRole('button', { name: '\u79fb\u5230\u5099\u7528' }))
  fireEvent.click(within(screen.getByTestId('day-0')).getByTestId('side-panel-tab-reserve'))

  expect(screen.getByTestId('reserve-card-pending-A')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByTestId('reserve-card-archived-A')).toBeInTheDocument())

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2300))
  })

  expect(screen.getByTestId('reserve-panel')).toBeInTheDocument()
  expect(screen.getByTestId('reserve-card-archived-A')).toBeInTheDocument()
})
