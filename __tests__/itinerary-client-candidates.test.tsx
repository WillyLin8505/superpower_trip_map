/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import type { PlanResult, ScheduledPlace, Candidate, Place } from '@/lib/types'

const addCandidate = jest.fn()
const removeCandidate = jest.fn()
jest.mock('@/app/actions/candidates', () => ({
  addCandidate: (...a: unknown[]) => addCandidate(...a),
  removeCandidate: (...a: unknown[]) => removeCandidate(...a),
  listCandidates: jest.fn(),
  archivePlace: jest.fn(),
  unarchivePlace: jest.fn(),
}))

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/app/actions/trips', () => ({
  createTrip: jest.fn(), saveTrip: jest.fn(async () => undefined), getTrip: jest.fn(),
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
// CombinedInput → a single 'pool-add' button that adds a typed Place
jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (p: Place) => void }) => (
    <button onClick={() => onAdd({ id: 'np', placeId: 'np', name: '新候選', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null })}>pool-add</button>
  ),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

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
    days: [{ day: 1, places: [sp('A'), sp('B')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving', startDate: '2026-07-04',
  }
}
function cand(id: string, name: string): Candidate {
  return {
    id, addedBy: 'u2', addedByName: '小明',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  }
}
function dayOrder(): string[] {
  return within(screen.getByTestId('day-0'))
    .getAllByTestId(/^card-/)
    .map((el) => (el.getAttribute('data-testid') ?? '').replace('card-', ''))
}

beforeEach(() => { addCandidate.mockReset(); removeCandidate.mockReset() })

// TASK-022: the trip-wide candidate pool now lives inside each day's SidePanel,
// under the "LINE 討論" tab (was: a standalone top-level <CandidatePanel> section).
function openLineTab(dayIdx = 0) {
  const day = screen.getByTestId(`day-${dayIdx}`)
  fireEvent.click(within(day).getByTestId('side-panel-tab-candidates'))
  return day
}

it('persistent mode renders the candidate pool with initial candidates under the LINE 討論 tab', () => {
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[cand('c1', '台北101')]} />)
  const day = openLineTab()
  expect(within(day).getByText('候選池')).toBeInTheDocument()
  expect(within(day).getByText('台北101')).toBeInTheDocument()
  expect(within(day).getByText(/小明/)).toBeInTheDocument()
})

it('anonymous mode (no tripId) shows the LINE 討論 tab with an empty pool, not the persisted candidates UI', () => {
  render(<ItineraryClient initial={plan()} />)
  const day = openLineTab()
  expect(within(day).getByText('候選池')).toBeInTheDocument()
  expect(within(day).getByText('還沒有候選，搜尋想去的地方加進來吧')).toBeInTheDocument()
})

it('search-add calls addCandidate and shows the new candidate in the pool', async () => {
  addCandidate.mockResolvedValue({ id: 'np' })
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[]} />)
  const day = openLineTab()
  fireEvent.click(within(day).getByText('pool-add'))
  await waitFor(() => expect(addCandidate).toHaveBeenCalledWith('t1', expect.objectContaining({ name: '新候選' })))
  await waitFor(() => expect(within(day).getByText('新候選')).toBeInTheDocument())
})

it('shows the pool candidate with an 加入本天 action and accepts it into that day on click', async () => {
  removeCandidate.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" initialCandidates={[cand('c1', '台北101')]} />)
  openLineTab()
  const addBtn = await screen.findByTestId('cand-add-c1')
  fireEvent.click(addBtn)
  expect(removeCandidate).toHaveBeenCalledWith('c1')
  expect(dayOrder()).toContain('c1')
  await waitFor(() => expect(screen.queryByTestId('cand-add-c1')).not.toBeInTheDocument())
})
