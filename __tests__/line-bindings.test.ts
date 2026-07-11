type QueryResult = { data: unknown; error: unknown }
type InsertResult = { error: unknown }
type UpdateResult = { error: unknown }
type SupabaseError = { code?: string; details?: string; message: string }

type BindingRow = {
  line_group_id: string
  trip_id: string
  write_as_user_id: string
  status: 'active' | 'disabled'
  updated_at?: string
}

type TripRow = {
  id: string
  owner_id: string
  invite_token?: string | null
}

type AdminState = {
  activeBindingLookup: QueryResult
  tripLookup: QueryResult
  insertResult: InsertResult
  updateResult: UpdateResult
  lastInsert: BindingRow | null
  lastUpdate: { status: 'disabled'; updated_at: string } | null
  updatePredicates: Array<{ column: string; value: string }>
  tripPredicates: Array<{ column: string; value: string }>
}

let adminState: AdminState

const NOT_FOUND_ERROR: SupabaseError = {
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  message: 'JSON object requested, multiple (or no) rows returned',
}

const MULTI_ROW_ERROR: SupabaseError = {
  code: 'PGRST116',
  details: 'The result contains 2 rows',
  message: 'JSON object requested, multiple (or no) rows returned',
}

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminClient(),
}))

function makeAdminClient() {
  return {
    from: jest.fn((table: string) => {
      if (table === 'trip_line_groups') return makeBindingsBuilder()
      if (table === 'trips') return makeTripsBuilder()
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function makeBindingsBuilder() {
  return {
    select: jest.fn((_columns: string) => {
      const predicates: Record<string, string> = {}
      const builder = {
        eq: jest.fn((column: string, value: string) => {
          predicates[column] = value
          return builder
        }),
        single: jest.fn(async () => {
          if (adminState.activeBindingLookup.error && !adminState.activeBindingLookup.data) {
            return adminState.activeBindingLookup
          }

          const row = adminState.activeBindingLookup.data as BindingRow | null
          const matches =
            row &&
            (!predicates.line_group_id || row.line_group_id === predicates.line_group_id) &&
            (!predicates.status || row.status === predicates.status)

          return matches ? adminState.activeBindingLookup : { data: null, error: NOT_FOUND_ERROR }
        }),
      }

      return builder
    }),
    insert: jest.fn(async (values: BindingRow) => {
      adminState.lastInsert = values
      return adminState.insertResult
    }),
    update: jest.fn((values: { status: 'disabled'; updated_at: string }) => {
      adminState.lastUpdate = values
      const predicates: Array<{ column: string; value: string }> = []
      const builder: {
        eq: jest.Mock
        then: Promise<UpdateResult>['then']
        catch: Promise<UpdateResult>['catch']
        finally: Promise<UpdateResult>['finally']
      } = {
        eq: jest.fn((column: string, value: string) => {
          predicates.push({ column, value })
          adminState.updatePredicates = [...predicates]
          return builder
        }),
        then: (onFulfilled, onRejected) =>
          Promise.resolve(adminState.updateResult).then(onFulfilled, onRejected),
        catch: (onRejected) => Promise.resolve(adminState.updateResult).catch(onRejected),
        finally: (onFinally) => Promise.resolve(adminState.updateResult).finally(onFinally),
      }

      return builder
    }),
  }
}

function makeTripsBuilder() {
  return {
    select: jest.fn((_columns: string) => ({
      eq: jest.fn((column: string, value: string) => ({
        single: jest.fn(async () => {
          adminState.tripPredicates.push({ column, value })
          if (adminState.tripLookup.error && !adminState.tripLookup.data) {
            return adminState.tripLookup
          }

          const row = adminState.tripLookup.data as TripRow | null
          if (!row) return adminState.tripLookup

          if (column === 'invite_token' && row.invite_token === value) return adminState.tripLookup
          return { data: null, error: NOT_FOUND_ERROR }
        }),
      })),
    })),
  }
}

function loadBindings() {
  return require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
}

beforeEach(() => {
  adminState = {
    activeBindingLookup: { data: null, error: NOT_FOUND_ERROR },
    tripLookup: {
      data: { id: 'trip-1', owner_id: 'owner-1', invite_token: 'invite-123' },
      error: null,
    },
    insertResult: { error: null },
    updateResult: { error: null },
    lastInsert: null,
    lastUpdate: null,
    updatePredicates: [],
    tripPredicates: [],
  }
  jest.resetModules()
  jest.restoreAllMocks()
})

it('resolves /join/<token> links and binds the LINE group to the trip owner', async () => {
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({
      lineGroupId: 'group-1',
      tripLinkOrToken: 'https://food-map.test/join/invite-123',
    }),
  ).resolves.toEqual({ tripId: 'trip-1' })

  expect(adminState.lastInsert).toEqual({
    line_group_id: 'group-1',
    trip_id: 'trip-1',
    write_as_user_id: 'owner-1',
    status: 'active',
  })
})

it('rejects /itinerary/<tripId> links because LINE binding requires an invite token', async () => {
  adminState.tripLookup = {
    data: { id: 'trip-99', owner_id: 'owner-99', invite_token: 'invite-99' },
    error: null,
  }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({
      lineGroupId: 'group-2',
      tripLinkOrToken: 'https://food-map.test/itinerary/trip-99',
    }),
  ).resolves.toBe('not_found')

  expect(adminState.tripPredicates).toEqual([])
  expect(adminState.lastInsert).toBeNull()
})

it('returns already_bound when the group has an active binding', async () => {
  adminState.activeBindingLookup = {
    data: {
      line_group_id: 'group-1',
      trip_id: 'trip-existing',
      write_as_user_id: 'owner-existing',
      status: 'active',
    },
    error: null,
  }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({ lineGroupId: 'group-1', tripLinkOrToken: 'invite-123' }),
  ).resolves.toBe('already_bound')

  expect(adminState.lastInsert).toBeNull()
})

it('returns not_found when the trip link or token cannot be resolved', async () => {
  adminState.tripLookup = { data: null, error: NOT_FOUND_ERROR }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({ lineGroupId: 'group-missing', tripLinkOrToken: 'invite-missing' }),
  ).resolves.toBe('not_found')

  expect(adminState.lastInsert).toBeNull()
})

it('returns already_bound when insert loses a race on the unique active-binding index', async () => {
  adminState.insertResult = { error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({ lineGroupId: 'group-race', tripLinkOrToken: 'invite-123' }),
  ).resolves.toBe('already_bound')
})

it('throws when active binding lookup hits a real database error', async () => {
  adminState.activeBindingLookup = {
    data: null,
    error: { code: 'XX000', message: 'connection lost' },
  }
  const { getActiveLineGroupBinding } = loadBindings()

  await expect(getActiveLineGroupBinding('group-error')).rejects.toThrow(
    'LINE_BIND_ACTIVE_LOOKUP_FAILED',
  )
})

it('throws when active binding lookup gets a multi-row PGRST116 error', async () => {
  adminState.activeBindingLookup = {
    data: null,
    error: MULTI_ROW_ERROR,
  }
  const { getActiveLineGroupBinding } = loadBindings()

  await expect(getActiveLineGroupBinding('group-multi')).rejects.toThrow(
    'LINE_BIND_ACTIVE_LOOKUP_FAILED',
  )
})

it('throws when active binding lookup gets a non-PGRST116 no-rows-shaped error', async () => {
  adminState.activeBindingLookup = {
    data: null,
    error: { code: 'XX000', message: 'no rows returned from replica' },
  }
  const { getActiveLineGroupBinding } = loadBindings()

  await expect(getActiveLineGroupBinding('group-false-no-rows')).rejects.toThrow(
    'LINE_BIND_ACTIVE_LOOKUP_FAILED',
  )
})

it('throws when active binding lookup gets a PGRST116 generic not-found error', async () => {
  adminState.activeBindingLookup = {
    data: null,
    error: { code: 'PGRST116', details: 'binding not found in cache', message: 'lookup failed' },
  }
  const { getActiveLineGroupBinding } = loadBindings()

  await expect(getActiveLineGroupBinding('group-false-not-found')).rejects.toThrow(
    'LINE_BIND_ACTIVE_LOOKUP_FAILED',
  )
})

it('throws when trip lookup hits a real database error', async () => {
  adminState.tripLookup = {
    data: null,
    error: { code: 'XX000', message: 'permission denied' },
  }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({ lineGroupId: 'group-trip-error', tripLinkOrToken: 'invite-123' }),
  ).rejects.toThrow('LINE_BIND_TRIP_LOOKUP_FAILED')

  expect(adminState.lastInsert).toBeNull()
})

it('throws when trip lookup gets a non-PGRST116 not-found-shaped error', async () => {
  adminState.tripLookup = {
    data: null,
    error: { code: 'XX000', details: 'trip not found in cache', message: 'lookup failed' },
  }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({ lineGroupId: 'group-trip-false-not-found', tripLinkOrToken: 'invite-123' }),
  ).rejects.toThrow('LINE_BIND_TRIP_LOOKUP_FAILED')

  expect(adminState.lastInsert).toBeNull()
})

it('throws when trip lookup gets a PGRST116 generic not-found error', async () => {
  adminState.tripLookup = {
    data: null,
    error: { code: 'PGRST116', details: 'trip not found in cache', message: 'lookup failed' },
  }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({ lineGroupId: 'group-trip-pgrst-not-found', tripLinkOrToken: 'invite-123' }),
  ).rejects.toThrow('LINE_BIND_TRIP_LOOKUP_FAILED')

  expect(adminState.lastInsert).toBeNull()
})

it('throws when trip lookup gets a multi-row PGRST116 error', async () => {
  adminState.tripLookup = {
    data: null,
    error: MULTI_ROW_ERROR,
  }
  const { bindLineGroupToTrip } = loadBindings()

  await expect(
    bindLineGroupToTrip({ lineGroupId: 'group-trip-multi', tripLinkOrToken: 'invite-123' }),
  ).rejects.toThrow('LINE_BIND_TRIP_LOOKUP_FAILED')

  expect(adminState.lastInsert).toBeNull()
})

it('unbindLineGroup disables the active binding', async () => {
  adminState.activeBindingLookup = {
    data: {
      line_group_id: 'group-3',
      trip_id: 'trip-3',
      write_as_user_id: 'owner-3',
      status: 'active',
    },
    error: null,
  }
  const { unbindLineGroup } = loadBindings()

  await expect(unbindLineGroup({ lineGroupId: 'group-3' })).resolves.toBe('unbound')

  expect(adminState.lastUpdate?.status).toBe('disabled')
  expect(adminState.lastUpdate?.updated_at).toEqual(expect.any(String))
  expect(adminState.updatePredicates).toEqual([
    { column: 'line_group_id', value: 'group-3' },
    { column: 'status', value: 'active' },
  ])
})

it('throws when unbind update fails', async () => {
  adminState.activeBindingLookup = {
    data: {
      line_group_id: 'group-4',
      trip_id: 'trip-4',
      write_as_user_id: 'owner-4',
      status: 'active',
    },
    error: null,
  }
  adminState.updateResult = {
    error: { code: 'XX000', message: 'write failed' },
  }
  const { unbindLineGroup } = loadBindings()

  await expect(unbindLineGroup({ lineGroupId: 'group-4' })).rejects.toThrow('LINE_UNBIND_FAILED')
})

it('unbindLineGroup returns not_bound when no active binding exists', async () => {
  const { unbindLineGroup } = loadBindings()

  await expect(unbindLineGroup({ lineGroupId: 'group-none' })).resolves.toBe('not_bound')

  expect(adminState.lastUpdate).toBeNull()
})

it('getActiveLineGroupBinding maps active row fields', async () => {
  adminState.activeBindingLookup = {
    data: {
      line_group_id: 'group-7',
      trip_id: 'trip-7',
      write_as_user_id: 'owner-7',
      status: 'active',
    },
    error: null,
  }
  const { getActiveLineGroupBinding } = loadBindings()

  await expect(getActiveLineGroupBinding('group-7')).resolves.toEqual({
    tripId: 'trip-7',
    writeAsUserId: 'owner-7',
  })
})
