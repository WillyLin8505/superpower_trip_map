import type { PlanResult } from '@/lib/types'

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

  // afterEq supports both read (.single) and mutation (.select) continuations
  const afterEq = { single, select: selectMutate }

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
    spies: { single, order, selectMutate, builder },
  }
}

let current: ReturnType<typeof makeSupabase>
jest.mock('@/lib/supabase/server', () => ({ createClient: () => current.client }))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' } as PlanResult

beforeEach(() => { current = makeSupabase() })

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

it('getTrip returns null on error', async () => {
  current = makeSupabase({ single: { data: null, error: { message: 'no' } } })
  const { getTrip } = require('@/app/actions/trips')
  expect(await getTrip('x')).toBeNull()
})

it('getTrip maps plan + title on success', async () => {
  current = makeSupabase({ single: { data: { plan, title: '東京' }, error: null } })
  const { getTrip } = require('@/app/actions/trips')
  expect(await getTrip('t1')).toEqual({ plan, title: '東京' })
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
