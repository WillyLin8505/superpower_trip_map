import { currentTripId } from '@/lib/apiUsageContext'
import type { Place } from '@/lib/types'

// Capture the ambient tripId that nested Google calls would see.
let seenTripId: string | null | undefined = 'UNSET'

jest.mock('@/app/actions/directions', () => ({
  buildDistanceMatrix: jest.fn(async () => {
    seenTripId = currentTripId()
    return { matrix: [[0, 600], [600, 0]], distances: [[0, 1000], [1000, 0]] }
  }),
}))

import { computeLegPlan, legInfo } from '@/app/actions/legs'

function place(id: string): Place {
  return {
    id,
    placeId: `pid-${id}`,
    name: id,
    type: 'attraction',
    lat: 25.0 + Number(id.length) * 0.01,
    lng: 121.5,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
  } as unknown as Place
}

beforeEach(() => {
  seenTripId = 'UNSET'
})

test('computeLegPlan attributes nested Google calls to the given trip', async () => {
  await computeLegPlan([place('a'), place('bb')], 'trip-legs')
  expect(seenTripId).toBe('trip-legs')
})

test('legInfo attributes nested Google calls to the given trip', async () => {
  await legInfo(place('a'), place('bb'), 'driving', 'trip-leg2')
  expect(seenTripId).toBe('trip-leg2')
})

test('no tripId → nested calls see null (unattributed, correct for pre-save searches)', async () => {
  await computeLegPlan([place('a'), place('bb')])
  expect(seenTripId).toBeNull()
})
