/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'

jest.mock('@/app/actions/recommend', () => ({
  getDayRecommendations: jest.fn(),
  fetchReplacementRecommendation: jest.fn(),
  refreshDayCategoryRecommendations: jest.fn(),
}))

// Adding a recommendation now auto smart-arranges the day; stub the arrange
// action to reject so these tests keep the plain append-and-promote behavior.
jest.mock('@/app/actions/arrange', () => ({
  fetchDayArrangeInputs: jest.fn().mockRejectedValue(new Error('no-arrange-in-test')),
}))

// Required mocks to prevent transitive import failures (same pattern as itinerary-date-controls.test.tsx)
jest.mock('@/lib/utils/clientScheduler', () => ({
  recalcPlan: jest.fn((p: unknown) => p),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
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
}))

jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
  checkOutsideHours: jest.fn(() => false),
  checkLateExit: jest.fn(() => false),
}))

import { ItineraryClient, recommendationCacheKeyForDays } from '@/app/itinerary/ItineraryClient'
import { getDayRecommendations, fetchReplacementRecommendation, refreshDayCategoryRecommendations } from '@/app/actions/recommend'
import type { PlanResult, RecommendationsByDay, DayRecommendation } from '@/lib/types'

function drec(placeId: string): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type: 'dessert', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, reason: '好吃', sourceLabel: '部落格',
  }
}

const plan: PlanResult = {
  transportMode: 'driving', startDate: '2026-07-01',
  days: [{
    day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
    places: [{
      id: 'x', placeId: 'x', name: '景點X', type: 'attraction', lat: 25, lng: 121, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null,
      startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
      outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
    }],
  }],
}

const recsWithReserve: RecommendationsByDay = [{
  dessert: { shown: [drec('d1'), drec('d3'), drec('d4'), drec('d5'), drec('d6')], reserve: [drec('d2')] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

const recsNoReserve: RecommendationsByDay = [{
  dessert: { shown: [drec('d1')], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

const recsPartialNoReserve: RecommendationsByDay = [{
  dessert: { shown: [drec('d1'), drec('d2'), drec('d3')], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}]

beforeEach(() => {
  jest.clearAllMocks()
})

it('promotes a reserve item when a card is added', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsWithReserve)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  // d1 removed, reserve d2 slid in; no Google fetch needed
  await waitFor(() => expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument())
  expect(screen.getByTestId('rec-add-d2')).toBeInTheDocument()
  expect(fetchReplacementRecommendation).not.toHaveBeenCalled()
  expect(screen.getByText('d1')).toBeInTheDocument()   // added place shows in itinerary
})

it('fetches a Google replacement when the reserve is empty', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsNoReserve)
  ;(fetchReplacementRecommendation as jest.Mock).mockResolvedValue(drec('g1'))
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchReplacementRecommendation).toHaveBeenCalledTimes(2))
  expect(await screen.findByTestId('rec-add-g1')).toBeInTheDocument()
})

it('backfills up to 5 visible recommendation cards after adding a card', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsPartialNoReserve)
  ;(fetchReplacementRecommendation as jest.Mock)
    .mockResolvedValueOnce(drec('g1'))
    .mockResolvedValueOnce(drec('g2'))
    .mockResolvedValueOnce(drec('g3'))
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchReplacementRecommendation).toHaveBeenCalledTimes(3))
  expect(await screen.findByTestId('rec-add-g1')).toBeInTheDocument()
  expect(await screen.findByTestId('rec-add-g2')).toBeInTheDocument()
  expect(await screen.findByTestId('rec-add-g3')).toBeInTheDocument()
})

it('leaves the slot empty when Google returns nothing (no crash)', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsNoReserve)
  ;(fetchReplacementRecommendation as jest.Mock).mockResolvedValue(null)
  render(<ItineraryClient initial={plan} />)
  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

  fireEvent.click(await screen.findByTestId('rec-add-d1'))

  await waitFor(() => expect(fetchReplacementRecommendation).toHaveBeenCalledTimes(1))
  expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument()
  expect(screen.getByText('d1')).toBeInTheDocument()   // added place still in itinerary
})

// --- TASK-010: manual recommendation center + 換一批 ---
describe('recommendation center and refresh', () => {
  beforeEach(() => {
    // Minimal google.maps.places.Autocomplete stub so RecommendationCenterPicker can be driven in jsdom.
    ;(window as unknown as { google: unknown }).google = {
      maps: {
        places: {
          Autocomplete: jest.fn().mockImplementation(() => ({
            addListener: (_event: string, cb: () => void) => {
              (window as unknown as { __acCallback: () => void }).__acCallback = cb
            },
            getPlace: () => (window as unknown as { __acPlace: unknown }).__acPlace,
          })),
        },
      },
    }
  })

  it('selecting a center persists it to the day and refetches only that day', async () => {
    ;(getDayRecommendations as jest.Mock)
      .mockResolvedValueOnce(recsNoReserve)   // initial mount fetch (all days)
      .mockResolvedValueOnce([recsWithReserve[0]])   // refetch after center set (single-day array)
    render(<ItineraryClient initial={plan} />)
    await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

    await screen.findByTestId('rec-center-input')
    ;(window as unknown as { __acPlace: unknown }).__acPlace = {
      place_id: 'ctr1', name: '台北車站', formatted_address: '台北市',
      geometry: { location: { lat: () => 25.05, lng: () => 121.52 } },
    }
    act(() => { (window as unknown as { __acCallback: () => void }).__acCallback() })

    await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(2))
    const secondCallArg = (getDayRecommendations as jest.Mock).mock.calls[1][0]
    expect(secondCallArg[0].recommendationCenter).toEqual({
      placeId: 'ctr1', name: '台北車站', lat: 25.05, lng: 121.52, address: '台北市', source: 'manual',
    })
    expect(screen.getByText('📍 台北車站')).toBeInTheDocument()
  })

  it('clearing a manual center persists null and refetches that day', async () => {
    const planWithCenter: PlanResult = {
      ...plan,
      days: [{ ...plan.days[0], recommendationCenter: { placeId: 'ctr1', name: '台北車站', lat: 25, lng: 121, address: null, source: 'manual' } }],
    }
    ;(getDayRecommendations as jest.Mock)
      .mockResolvedValueOnce(recsNoReserve)
      .mockResolvedValueOnce([recsNoReserve[0]])
    render(<ItineraryClient initial={planWithCenter} />)
    await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByTestId('rec-center-clear'))

    await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(2))
    const secondCallArg = (getDayRecommendations as jest.Mock).mock.calls[1][0]
    expect(secondCallArg[0].recommendationCenter).toBeNull()
  })

  it('換一批 replaces only the active category, preserving other categories', async () => {
    ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsWithReserve)
    ;(refreshDayCategoryRecommendations as jest.Mock).mockResolvedValue([
      { id: 'new1', placeId: 'new1', name: 'new1', type: 'dessert', lat: 25, lng: 121, address: '', openingHours: null, rating: null, photoUrl: null, description: null, reason: 'r', sourceLabel: 'Google 推薦' },
    ])
    render(<ItineraryClient initial={plan} />)
    await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))

    fireEvent.click(await screen.findByTestId('rec-refresh'))

    await waitFor(() => expect(refreshDayCategoryRecommendations).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('rec-add-new1')).toBeInTheDocument()
    expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument()   // replaced, not appended
  })
})

it('uses complete saved recommendation cache without fetching on reload', async () => {
  const completeCachedRecs: RecommendationsByDay = [{
    dessert: recsWithReserve[0].dessert,
    attraction: { shown: [drec('a1'), drec('a2'), drec('a3'), drec('a4'), drec('a5')], reserve: [] },
    restaurant: { shown: [drec('r1'), drec('r2'), drec('r3'), drec('r4'), drec('r5')], reserve: [] },
  }]
  const cachedPlan: PlanResult = {
    ...plan,
    recommendations: completeCachedRecs,
    recommendationsCacheKey: recommendationCacheKeyForDays(plan.days),
    recommendationsCachedAt: '2026-07-23T00:00:00.000Z',
  }

  render(<ItineraryClient initial={cachedPlan} />)

  expect(await screen.findByTestId('rec-add-d1')).toBeInTheDocument()
  expect(getDayRecommendations).not.toHaveBeenCalled()
})

it('ignores stale saved recommendation cache and refetches', async () => {
  ;(getDayRecommendations as jest.Mock).mockResolvedValue(recsNoReserve)
  const stalePlan: PlanResult = {
    ...plan,
    recommendations: recsWithReserve,
    recommendationsCacheKey: 'stale-cache-key',
  }

  render(<ItineraryClient initial={stalePlan} />)

  await waitFor(() => expect(getDayRecommendations).toHaveBeenCalledTimes(1))
})
