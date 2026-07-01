import type { PlanResult } from '@/lib/types'

// 可鏈式呼叫的 Supabase mock builder
function makeSupabase(overrides: {
  user?: { id: string } | null
  single?: { data: unknown; error: unknown }
  list?: { data: unknown; error: unknown }
  mutate?: { error: unknown }
} = {}) {
  const single = jest.fn(async () => overrides.single ?? { data: { id: 't1' }, error: null })
  const order = jest.fn(async () => overrides.list ?? { data: [], error: null })
  const eqMutate = jest.fn(async () => overrides.mutate ?? { error: null })

  const builder: any = {
    insert: jest.fn(() => builder),
    select: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => ({ ...builder, single, then: (r: any) => eqMutate().then(r) })),
    order,
    single,
  }
  // delete().eq() 與 update().eq() 需 await 回 { error }
  builder.eq = jest.fn(() => Object.assign(eqMutate(), { single }))
  return {
    client: {
      from: jest.fn(() => builder),
      auth: { getUser: jest.fn(async () => ({ data: { user: 'user' in overrides ? overrides.user : { id: 'u1' } } })) },
    },
    spies: { single, order, eqMutate, builder },
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
