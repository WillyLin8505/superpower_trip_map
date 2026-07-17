import type { PlanResult, RecommendationCenter } from '@/lib/types'

// Chainable Supabase mock builder.
// Mutation chain shape (after fix): .from().update/delete().eq().select('id') → { data, error }
// Read chain shape: .from().select().eq().single() → { data, error }
//                  .from().select().order() → { data, error }
function makeSupabase(overrides: {
  user?: { id: string } | null
  single?: { data: unknown; error: unknown }
  list?: { data: unknown; error: unknown }
  mutate?: { data?: unknown; error: unknown }
} = {}) {
  const single = jest.fn(async () => overrides.single ?? { data: { id: 't1' }, error: null })
  const order = jest.fn(async () => overrides.list ?? { data: [], error: null })
  // Terminal step for mutation chains: .eq().select('id')
  const selectMutate = jest.fn(async () =>
    overrides.mutate !== undefined
      ? overrides.mutate
      : { data: [{ id: 't1' }], error: null }
  )

  const maybeSingle = jest.fn(async () => overrides.single ?? { data: { user_id: 'u1' }, error: null })
  // afterEq supports read (.single/.maybeSingle) and mutation (.select) continuations
  const afterEq: any = { single, maybeSingle, select: selectMutate }
  afterEq.eq = jest.fn(() => afterEq)

  const builder: any = {
    insert: jest.fn(() => builder),
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => afterEq),
    order,
    single,
  }
  return {
    client: {
      from: jest.fn(() => builder),
      auth: { getUser: jest.fn(async () => ({ data: { user: 'user' in overrides ? overrides.user : { id: 'u1' } } })) },
    },
    spies: { single, maybeSingle, order, selectMutate, builder },
  }
}

let current: ReturnType<typeof makeSupabase>
let currentAdmin: ReturnType<typeof makeSupabase>
jest.mock('@/lib/supabase/server', () => ({ createClient: () => current.client }))
jest.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin.client }))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' } as PlanResult
const realFetch = global.fetch
const realTranslateKey = process.env.GOOGLE_TRANSLATE_API_KEY

beforeEach(() => {
  current = makeSupabase()
  currentAdmin = makeSupabase()
})

afterEach(() => {
  global.fetch = realFetch
  if (realTranslateKey === undefined) delete process.env.GOOGLE_TRANSLATE_API_KEY
  else process.env.GOOGLE_TRANSLATE_API_KEY = realTranslateKey
})

function mockAdminTripRead(row: unknown) {
  current = makeSupabase({ user: { id: 'u1' } })
  currentAdmin = makeSupabase()
  currentAdmin.spies.single
    .mockResolvedValueOnce({ data: { owner_id: 'u1' }, error: null })
    .mockResolvedValueOnce({ data: row, error: null })
}

it('createTrip inserts owner_id + plan and returns the new id', async () => {
  current = makeSupabase({ user: { id: 'u1' }, single: { data: { id: 'new-id' }, error: null } })
  const { createTrip } = require('@/app/actions/trips')
  const out = await createTrip(plan, '東京三日')
  expect(out).toEqual({ tripId: 'new-id' })
  expect(current.client.from).toHaveBeenCalledWith('trips')
})

it('createTrip throws NOT_AUTHENTICATED when no user', async () => {
  current = makeSupabase({ user: null })
  const { createTrip } = require('@/app/actions/trips')
  await expect(createTrip(plan, 't')).rejects.toThrow('NOT_AUTHENTICATED')
})

it('createTripSafe returns NOT_AUTHENTICATED instead of throwing when no user', async () => {
  current = makeSupabase({ user: null })
  const { createTripSafe } = require('@/app/actions/trips')
  await expect(createTripSafe(plan, 't')).resolves.toEqual({ ok: false, error: 'NOT_AUTHENTICATED' })
})

it('createTripSafe returns visible database errors instead of throwing', async () => {
  current = makeSupabase({ user: { id: 'u1' } })
  currentAdmin = makeSupabase({
    single: {
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'invite_code' column" },
    },
  })
  const { createTripSafe } = require('@/app/actions/trips')
  await expect(createTripSafe(plan, 't')).resolves.toEqual({
    ok: false,
    code: 'PGRST204',
    error: "Could not find the 'invite_code' column",
  })
})

it('getTrip returns null on error', async () => {
  current = makeSupabase({ user: { id: 'u1' } })
  currentAdmin = makeSupabase({ single: { data: null, error: { message: 'no' } } })
  const { getTrip } = require('@/app/actions/trips')
  expect(await getTrip('x')).toBeNull()
})

it('getTrip maps plan + title + ownerId on success through the admin client', async () => {
  mockAdminTripRead({ plan, title: 'Trip', owner_id: 'u1' })
  const { getTrip } = require('@/app/actions/trips')
  expect(await getTrip('t1')).toEqual({ plan, title: 'Trip', ownerId: 'u1' })
  expect(currentAdmin.client.from).toHaveBeenCalledWith('trips')
})

it('getTrip translates saved place names that are missing Traditional Chinese', async () => {
  process.env.GOOGLE_TRANSLATE_API_KEY = 'test-translate-key'
  global.fetch = jest.fn(async () => ({
    json: async () => ({
      data: { translations: [{ translatedText: '我在麵店' }] },
    }),
  })) as unknown as typeof fetch

  const savedPlan: PlanResult = {
    days: [{
      day: 1,
      aiSummary: null,
      dayStart: '09:00',
      dayEnd: '21:00',
      places: [{
        id: 'p1',
        placeId: 'google-p1',
        name: 'Me In Noodles',
        localizedName: { zhTw: null, en: 'Me In Noodles', original: 'Me In Noodles' },
        type: 'restaurant',
        lat: 21.03,
        lng: 105.84,
        address: 'Hanoi',
        openingHours: null,
        rating: 4.8,
        photoUrl: null,
        description: null,
        startTime: '09:00',
        durationMin: 60,
        travelMinToNext: null,
        aiDescription: null,
        outsideHours: false,
        lateExit: false,
        startLocked: false,
        durationLocked: false,
      }],
    }],
    transportMode: 'driving',
    startDate: '2026-07-04',
  }
  mockAdminTripRead({ plan: savedPlan, title: 'Trip', owner_id: 'u1' })

  const { getTrip } = require('@/app/actions/trips')
  const result = await getTrip('t1')

  expect(result?.plan.days[0].places[0]).toEqual(expect.objectContaining({
    name: '我在麵店',
    localizedName: {
      zhTw: '我在麵店',
      en: 'Me In Noodles',
      original: 'Me In Noodles',
    },
  }))
})

it('listTrips maps rows to TripSummary', async () => {
  current = makeSupabase({ list: { data: [{ id: 'a', title: 'A', updated_at: '2026-07-01T00:00:00Z' }], error: null } })
  const { listTrips } = require('@/app/actions/trips')
  expect(await listTrips()).toEqual([{ id: 'a', title: 'A', updatedAt: '2026-07-01T00:00:00Z' }])
})

it('saveTrip throws a zh error when update fails', async () => {
  current = makeSupabase({ mutate: { error: { message: 'boom' } } })
  const { saveTrip } = require('@/app/actions/trips')
  await expect(saveTrip('t1', plan)).rejects.toThrow('儲存失敗，請稍後再試')
})

it('saveTrip throws 儲存失敗 when RLS blocks the write (0 rows affected, no error)', async () => {
  current = makeSupabase({ mutate: { data: [], error: null } })
  const { saveTrip } = require('@/app/actions/trips')
  await expect(saveTrip('t1', plan)).rejects.toThrow('儲存失敗，請稍後再試')
})

it('saveTripSafe returns visible database errors instead of throwing', async () => {
  current = makeSupabase({ user: { id: 'u1' } })
  currentAdmin = makeSupabase({
    single: { data: { owner_id: 'u1' }, error: null },
    mutate: { error: { code: '42501', message: 'permission denied' } },
  })
  const { saveTripSafe } = require('@/app/actions/trips')
  await expect(saveTripSafe('t1', plan)).resolves.toEqual({
    ok: false,
    code: '42501',
    error: 'permission denied',
  })
})

it('saveTripSafe updates through admin client when the current user owns the trip', async () => {
  current = makeSupabase({ user: { id: 'u1' } })
  currentAdmin = makeSupabase({
    single: { data: { owner_id: 'u1' }, error: null },
    mutate: { data: [{ id: 't1' }], error: null },
  })
  const { saveTripSafe } = require('@/app/actions/trips')
  await expect(saveTripSafe('t1', plan)).resolves.toEqual({ ok: true })
  expect(currentAdmin.client.from).toHaveBeenCalledWith('trips')
})

it('saveTripSafe rejects users who are not owners or members', async () => {
  current = makeSupabase({ user: { id: 'u2' } })
  currentAdmin = makeSupabase({
    single: { data: { owner_id: 'u1' }, error: null },
  })
  currentAdmin.spies.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
  const { saveTripSafe } = require('@/app/actions/trips')
  await expect(saveTripSafe('t1', plan)).resolves.toEqual({
    ok: false,
    error: '你沒有權限編輯這個行程',
  })
})

it('saveTripSafe explains when RLS updates zero rows', async () => {
  current = makeSupabase({ user: { id: 'u1' } })
  currentAdmin = makeSupabase({
    single: { data: { owner_id: 'u1' }, error: null },
    mutate: { data: [], error: null },
  })
  const { saveTripSafe } = require('@/app/actions/trips')
  await expect(saveTripSafe('t1', plan)).resolves.toEqual({
    ok: false,
    code: undefined,
    error: 'No rows were updated. You may not have permission to edit this trip.',
  })
})

// --- TASK-009: recommendationCenter persists through trip save/load (JSONB round-trip) ---
it('getTrip round-trips a persisted manual recommendationCenter on a day', async () => {
  const center: RecommendationCenter = {
    placeId: 'ctr1', name: '中心點', lat: 25.03, lng: 121.56, address: '台北市', source: 'manual',
  }
  const planWithCenter: PlanResult = {
    days: [{ day: 1, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00', recommendationCenter: center }],
    transportMode: 'driving',
    startDate: '2026-07-04',
  }
  mockAdminTripRead({ plan: planWithCenter, title: 'Trip', owner_id: 'u1' })
  const { getTrip } = require('@/app/actions/trips')
  const result = await getTrip('t1')
  expect(result?.plan.days[0].recommendationCenter).toEqual(center)
})

it('getTrip round-trips a cleared (null) recommendationCenter on a day', async () => {
  const planWithNullCenter: PlanResult = {
    days: [{ day: 1, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00', recommendationCenter: null }],
    transportMode: 'driving',
    startDate: '2026-07-04',
  }
  mockAdminTripRead({ plan: planWithNullCenter, title: 'Trip', owner_id: 'u1' })
  const { getTrip } = require('@/app/actions/trips')
  const result = await getTrip('t1')
  expect(result?.plan.days[0].recommendationCenter).toBeNull()
})
