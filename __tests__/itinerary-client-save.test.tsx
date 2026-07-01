/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// --- trips actions mock (must be before ItineraryClient import) ---
const createTrip = jest.fn()
const saveTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({
  createTrip: (...a: unknown[]) => createTrip(...a),
  saveTrip: (...a: unknown[]) => saveTrip(...a),
  getTrip: jest.fn(),
  listTrips: jest.fn(),
  renameTrip: jest.fn(),
  deleteTrip: jest.fn(),
}))

// --- next/navigation mock ---
const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// --- arrange mock (not under test here) ---
jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: jest.fn(),
}))

// --- scheduler mock: identity so plan state changes are visible ---
jest.mock('@/lib/utils/clientScheduler', () => ({
  ...jest.requireActual('@/lib/utils/clientScheduler'),
  recalcPlan: jest.fn((p: unknown) => p),
}))

// --- dnd-kit: pass children through ---
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

jest.mock('@/components/RecommendPanel', () => ({
  RecommendPanel: () => null,
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
}))

jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

// legs mock — not under test but imported by component
jest.mock('@/app/actions/legs', () => ({
  legDuration: jest.fn(),
  computeLegPlan: jest.fn(async () => []),
}))

import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import type { PlanResult, ScheduledPlace } from '@/lib/types'

// --- helpers (copied from smart-arrange test) ---
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
    days: [{ day: 1, places: [sp('A'), sp('B'), sp('C')], aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }],
    transportMode: 'driving', startDate: '2026-07-04',
  }
}

beforeEach(() => {
  createTrip.mockReset()
  saveTrip.mockReset()
  push.mockReset()
})

// ─── anonymous mode ───────────────────────────────────────────────────────────

it('anon mode: 儲存行程 click creates trip then routes to /itinerary/<id>', async () => {
  createTrip.mockResolvedValue({ tripId: 't1' })
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '儲存行程' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/itinerary/t1'))
})

it('anon mode: NOT_AUTHENTICATED routes to /login?next=/itinerary', async () => {
  createTrip.mockRejectedValue(new Error('NOT_AUTHENTICATED'))
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '儲存行程' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/login?next=%2Fitinerary'))
})

it('anon mode: other error sets saveState to error (no redirect)', async () => {
  createTrip.mockRejectedValue(new Error('server error'))
  render(<ItineraryClient initial={plan()} />)
  fireEvent.click(screen.getByRole('button', { name: '儲存行程' }))
  // push should NOT have been called
  await waitFor(() => expect(createTrip).toHaveBeenCalled())
  expect(push).not.toHaveBeenCalled()
})

// ─── persistent mode (autosave) ───────────────────────────────────────────────

it('persistent mode: shows 已儲存 after an autosave succeeds', async () => {
  jest.useFakeTimers()
  saveTrip.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  // Trigger a real plan change: toggle startLocked on place A (day 0, place "A")
  // ItineraryCard renders buttons with aria-label "鎖定開始時間" when unlocked
  const lockBtns = screen.getAllByRole('button', { name: '鎖定開始時間' })
  fireEvent.click(lockBtns[0])

  // Advance debounce timer past 1500ms
  await act(async () => {
    jest.advanceTimersByTime(2000)
  })

  await waitFor(() => expect(saveTrip).toHaveBeenCalledWith('t1', expect.any(Object)))
  await waitFor(() => expect(screen.getByText('已儲存')).toBeInTheDocument())

  jest.useRealTimers()
})

it('persistent mode: shows 儲存中… immediately after a plan change', async () => {
  jest.useFakeTimers()
  saveTrip.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  // Toggle a lock to dirty the plan
  const lockBtns = screen.getAllByRole('button', { name: '鎖定開始時間' })
  fireEvent.click(lockBtns[0])

  // Should immediately show 儲存中… before debounce fires
  expect(screen.getByText('儲存中…')).toBeInTheDocument()

  // Flush the pending 1500ms debounce before switching back to real timers
  await act(async () => { jest.advanceTimersByTime(2000) })
  jest.useRealTimers()
})

it('persistent mode: autosave is NOT triggered when plan has not changed', async () => {
  jest.useFakeTimers()
  saveTrip.mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  // Advance time without any plan change
  await act(async () => {
    jest.advanceTimersByTime(3000)
  })

  expect(saveTrip).not.toHaveBeenCalled()

  jest.useRealTimers()
})

it('persistent mode: retry button calls saveTrip and shows 已儲存 on success', async () => {
  jest.useFakeTimers()
  // First autosave fails, retry resolves
  saveTrip.mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined)
  render(<ItineraryClient initial={plan()} tripId="t1" />)

  // Trigger a plan change to kick off autosave
  const lockBtns = screen.getAllByRole('button', { name: '鎖定開始時間' })
  fireEvent.click(lockBtns[0])

  // Advance past debounce → autosave fires and fails
  await act(async () => { jest.advanceTimersByTime(2000) })

  await waitFor(() =>
    expect(screen.getByRole('button', { name: '儲存失敗，點此重試' })).toBeInTheDocument()
  )

  const callsBefore = saveTrip.mock.calls.length

  // Click the retry button
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '儲存失敗，點此重試' }))
  })

  // saveTrip must have been called again and 已儲存 must appear
  await waitFor(() => expect(saveTrip.mock.calls.length).toBeGreaterThan(callsBefore))
  await waitFor(() => expect(screen.getByText('已儲存')).toBeInTheDocument())

  await act(async () => { jest.advanceTimersByTime(2000) })
  jest.useRealTimers()
})
