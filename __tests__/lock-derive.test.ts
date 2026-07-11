import { effectivePinned } from '@/lib/utils/lockDerive'
import type { ScheduledPlace } from '@/lib/types'

function place(overrides: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: 'p1',
    placeId: 'g1',
    name: 'Tokyo Tower',
    type: 'attraction',
    lat: 35,
    lng: 139,
    address: 'Tokyo',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
    startTime: '10:00',
    durationMin: 90,
    travelMinToNext: null,
    aiDescription: null,
    outsideHours: false,
    lateExit: false,
    startLocked: false,
    durationLocked: false,
    ...overrides,
  }
}

it('does not derive extra pinned facets when fewer than two locks are set', () => {
  expect(effectivePinned(place())).toEqual({ start: false, duration: false, end: false })
  expect(effectivePinned(place({ startLocked: true }))).toEqual({
    start: true,
    duration: false,
    end: false,
  })
  expect(effectivePinned(place({ durationLocked: true }))).toEqual({
    start: false,
    duration: true,
    end: false,
  })
  expect(effectivePinned(place({ endLocked: true }))).toEqual({
    start: false,
    duration: false,
    end: true,
  })
})

it('derives the third pinned facet when any two time locks are set', () => {
  expect(effectivePinned(place({ startLocked: true, durationLocked: true }))).toEqual({
    start: true,
    duration: true,
    end: true,
  })
  expect(effectivePinned(place({ startLocked: true, endLocked: true }))).toEqual({
    start: true,
    duration: true,
    end: true,
  })
  expect(effectivePinned(place({ durationLocked: true, endLocked: true }))).toEqual({
    start: true,
    duration: true,
    end: true,
  })
})
