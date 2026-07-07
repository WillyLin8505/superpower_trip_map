type TripRow = { id: string; owner_id: string; invite_token: string | null }
type GroupRow = { line_group_id: string; trip_id: string; write_as_user_id: string; status: string }

let trips: TripRow[]
let groups: GroupRow[]
let lastUpdate: Record<string, unknown> | null
let lastInsert: Record<string, unknown> | null
let updateError: { message: string } | null
let insertError: { message: string } | null

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'trips') return makeTripsBuilder()
      if (table === 'trip_line_groups') return makeGroupsBuilder()
      throw new Error(`Unexpected table ${table}`)
    },
  }),
}))

function makeTripsBuilder() {
  return {
    select: () => ({
      eq: (column: string, value: string) => ({
        single: async () => {
          const row = trips.find((trip) => String(trip[column as keyof TripRow]) === value)
          return { data: row ?? null, error: row ? null : { message: 'not found' } }
        },
      }),
    }),
  }
}

function makeGroupsBuilder() {
  return {
    select: () => ({
      eq: (column: string, value: string) => ({
        eq: (_column2: string, value2: string) => ({
          maybeSingle: async () => {
            const row = groups.find((group) => group.line_group_id === value && group.status === value2)
            return { data: row ?? null, error: null }
          },
        }),
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      lastUpdate = payload
      return {
        eq: (column: string, value: string) => ({
          eq: (_column2: string, value2: string) => {
            if (updateError) {
              return { select: async () => ({ data: null, error: updateError }) }
            }

            groups = groups.map((group) =>
              group.line_group_id === value && group.status === value2
                ? { ...group, status: String(payload.status) }
                : group,
            )
            return { select: async () => ({ data: [{ line_group_id: value }], error: null }) }
          },
        }),
      }
    },
    insert: (payload: Record<string, unknown>) => {
      lastInsert = payload
      if (insertError) {
        return { select: () => ({ single: async () => ({ data: null, error: insertError }) }) }
      }

      groups.push({
        line_group_id: String(payload.line_group_id),
        trip_id: String(payload.trip_id),
        write_as_user_id: String(payload.write_as_user_id),
        status: String(payload.status ?? 'active'),
      })
      return { select: () => ({ single: async () => ({ data: { id: 'binding-1' }, error: null }) }) }
    },
  }
}

beforeEach(() => {
  jest.resetModules()
  trips = [{ id: 'trip-1', owner_id: 'owner-1', invite_token: 'token-1' }]
  groups = []
  lastUpdate = null
  lastInsert = null
  updateError = null
  insertError = null
})

it('binds a LINE group from a join link token', async () => {
  const { bindLineGroupToTrip } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(bindLineGroupToTrip({
    lineGroupId: 'Cg123',
    tripLinkOrToken: 'https://app.example.com/join/token-1',
  })).resolves.toEqual({ tripId: 'trip-1' })

  expect(lastInsert).toEqual({
    line_group_id: 'Cg123',
    trip_id: 'trip-1',
    write_as_user_id: 'owner-1',
    status: 'active',
  })
  expect(lastUpdate).toBeNull()
})

it('rejects binding an already-bound LINE group without replacing it', async () => {
  groups = [{ line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' }]
  const { bindLineGroupToTrip } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(bindLineGroupToTrip({
    lineGroupId: 'Cg123',
    tripLinkOrToken: 'token-1',
  })).rejects.toThrow('LINE_GROUP_ALREADY_BOUND')

  expect(lastUpdate).toBeNull()
  expect(lastInsert).toBeNull()
  expect(groups).toEqual([
    { line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' },
  ])
})

it('disables an active binding', async () => {
  groups = [{ line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' }]
  const { unbindLineGroup } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(unbindLineGroup({ lineGroupId: 'Cg123' })).resolves.toBeUndefined()
  expect(lastUpdate).toEqual({ status: 'disabled' })
})

it('fails when disabling an active binding fails', async () => {
  groups = [{ line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' }]
  updateError = { message: 'update failed' }
  const { unbindLineGroup } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(unbindLineGroup({ lineGroupId: 'Cg123' })).rejects.toThrow('LINE_UNBIND_FAILED')
  expect(lastUpdate).toEqual({ status: 'disabled' })
  expect(groups).toEqual([
    { line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' },
  ])
})

it('does not disable active bindings when a new bind insert fails', async () => {
  insertError = { message: 'insert failed' }
  const { bindLineGroupToTrip } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(bindLineGroupToTrip({
    lineGroupId: 'Cg123',
    tripLinkOrToken: 'token-1',
  })).rejects.toThrow('LINE_BIND_FAILED')

  expect(lastUpdate).toBeNull()
  expect(groups).toEqual([])
})

it('returns the active binding or null', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')

  await expect(getActiveLineGroupBinding('Cg123')).resolves.toBeNull()

  groups = [{ line_group_id: 'Cg123', trip_id: 'trip-1', write_as_user_id: 'owner-1', status: 'active' }]
  await expect(getActiveLineGroupBinding('Cg123')).resolves.toEqual({
    lineGroupId: 'Cg123',
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
})
