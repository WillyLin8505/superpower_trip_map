type AuthUser = { id: string } | null

type QueryResult = { data: unknown; error: unknown }
type UpdatePredicate = { column: string; value: string }
type UpdateResult = { data: Array<{ id: string }> | null; error: unknown }
type InsertResult = { error: { code?: string } | null }

type AdminState = {
  tripLookup: QueryResult
  ownerLookup: QueryResult
  updateResult: UpdateResult
  insertResult: InsertResult
  lastUpdate: { invite_token?: string; invite_code?: string } | null
  lastUpdatePredicates: UpdatePredicate[]
  lastUpdateSelect: string | null
  lastInsert: { trip_id: string; user_id: string; role: 'editor' } | null
}

let authUser: AuthUser = { id: 'user-1' }
let adminState: AdminState

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: authUser } })),
    },
  }),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminClient(),
}))

function makeAdminClient() {
  return {
    from: jest.fn((table: string) => {
      if (table === 'trips') return makeTripsBuilder()
      if (table === 'trip_members') return makeTripMembersBuilder()
      throw new Error(`Unexpected table ${table}`)
    }),
  }
}

function makeTripsBuilder() {
  return {
    select: jest.fn((_columns: string) => ({
      eq: jest.fn((_column: string, value: string) => ({
        single: jest.fn(async () =>
          value.startsWith('invite-') || /^\d{6}$/.test(value) ? adminState.tripLookup : adminState.ownerLookup,
        ),
      })),
    })),
    update: jest.fn((values: { invite_token?: string; invite_code?: string }) => {
      adminState.lastUpdate = values

      const predicates: UpdatePredicate[] = []
      const builder = {
        eq: jest.fn((column: string, value: string) => {
          predicates.push({ column, value })
          adminState.lastUpdatePredicates = [...predicates]
          return builder
        }),
        select: jest.fn(async (columns: string) => {
          adminState.lastUpdateSelect = columns
          return adminState.updateResult
        }),
      }

      return builder
    }),
  }
}

function makeTripMembersBuilder() {
  return {
    insert: jest.fn(async (values: { trip_id: string; user_id: string; role: 'editor' }) => {
      adminState.lastInsert = values
      return adminState.insertResult
    }),
  }
}

function loadActions() {
  return require('@/app/actions/members') as typeof import('@/app/actions/members')
}

beforeEach(() => {
  authUser = { id: 'user-1' }
  adminState = {
    tripLookup: { data: { id: 'trip-1', owner_id: 'owner-1' }, error: null },
    ownerLookup: { data: { owner_id: 'owner-1', invite_token: 'invite-existing', invite_code: '123456' }, error: null },
    updateResult: { data: [{ id: 'trip-1' }], error: null },
    insertResult: { error: null },
    lastUpdate: null,
    lastUpdatePredicates: [],
    lastUpdateSelect: null,
    lastInsert: null,
  }
  jest.resetModules()
  jest.restoreAllMocks()
})

it('joinTrip throws NOT_AUTHENTICATED when logged out', async () => {
  authUser = null
  const { joinTrip } = loadActions()
  await expect(joinTrip('invite-123')).rejects.toThrow('NOT_AUTHENTICATED')
})

it('joinTrip throws INVALID_INVITE when token has no trip', async () => {
  adminState.tripLookup = { data: null, error: { message: 'not found' } }
  const { joinTrip } = loadActions()
  await expect(joinTrip('invite-missing')).rejects.toThrow('INVALID_INVITE')
})

it('joinTrip returns tripId and does not insert when caller is owner', async () => {
  authUser = { id: 'owner-1' }
  const { joinTrip } = loadActions()
  await expect(joinTrip('invite-owner')).resolves.toEqual({ tripId: 'trip-1' })
  expect(adminState.lastInsert).toBeNull()
})

it('joinTrip inserts editor membership for a new member', async () => {
  const { joinTrip } = loadActions()
  await expect(joinTrip('invite-join')).resolves.toEqual({ tripId: 'trip-1' })
  expect(adminState.lastInsert).toEqual({ trip_id: 'trip-1', user_id: 'user-1', role: 'editor' })
})

it('joinTrip treats duplicate membership error code 23505 as success', async () => {
  adminState.insertResult = { error: { code: '23505' } }
  const { joinTrip } = loadActions()
  await expect(joinTrip('invite-duplicate')).resolves.toEqual({ tripId: 'trip-1' })
})

it('getInviteLink throws NOT_OWNER for non-owner', async () => {
  const { getInviteLink } = loadActions()
  await expect(getInviteLink('trip-1')).rejects.toThrow('NOT_OWNER')
})

it('getInviteLink returns existing token without update', async () => {
  authUser = { id: 'owner-1' }
  const { getInviteLink } = loadActions()
  await expect(getInviteLink('trip-1')).resolves.toEqual({ token: 'invite-existing', code: '123456' })
  expect(adminState.lastUpdate).toBeNull()
})

it('getInviteLink generates and persists a UUID and six-digit code when missing', async () => {
  authUser = { id: 'owner-1' }
  adminState.ownerLookup = { data: { owner_id: 'owner-1', invite_token: null, invite_code: null }, error: null }
  jest.spyOn(crypto, 'randomUUID').mockReturnValue('invite-new')
  jest.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    ;(array as Uint32Array)[0] = 123456
    return array
  })
  const { getInviteLink } = loadActions()
  await expect(getInviteLink('trip-1')).resolves.toEqual({ token: 'invite-new', code: '123456' })
  expect(adminState.lastUpdate).toEqual({ invite_token: 'invite-new', invite_code: '123456' })
  expect(adminState.lastUpdatePredicates).toEqual([
    { column: 'id', value: 'trip-1' },
    { column: 'owner_id', value: 'owner-1' },
  ])
  expect(adminState.lastUpdateSelect).toBe('id')
})

it('rotateInvite owner gets a new persisted token', async () => {
  authUser = { id: 'owner-1' }
  jest.spyOn(crypto, 'randomUUID').mockReturnValue('invite-rotated')
  jest.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    ;(array as Uint32Array)[0] = 654321
    return array
  })
  const { rotateInvite } = loadActions()
  await expect(rotateInvite('trip-1')).resolves.toEqual({ token: 'invite-rotated', code: '654321' })
  expect(adminState.lastUpdate).toEqual({ invite_token: 'invite-rotated', invite_code: '654321' })
  expect(adminState.lastUpdatePredicates).toEqual([
    { column: 'id', value: 'trip-1' },
    { column: 'owner_id', value: 'owner-1' },
  ])
  expect(adminState.lastUpdateSelect).toBe('id')
})

it('rotateInvite throws NOT_OWNER for non-owner', async () => {
  const { rotateInvite } = loadActions()
  await expect(rotateInvite('trip-1')).rejects.toThrow('NOT_OWNER')
})

it('rotateInvite throws INVITE_UPDATE_FAILED when owner-scoped update affects no rows', async () => {
  authUser = { id: 'owner-1' }
  adminState.updateResult = { data: [], error: null }
  jest.spyOn(crypto, 'randomUUID').mockReturnValue('invite-missed')
  jest.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
    ;(array as Uint32Array)[0] = 111111
    return array
  })
  const { rotateInvite } = loadActions()
  await expect(rotateInvite('trip-1')).rejects.toThrow('INVITE_UPDATE_FAILED')
  expect(adminState.lastUpdate).toEqual({ invite_token: 'invite-missed', invite_code: '111111' })
  expect(adminState.lastUpdatePredicates).toEqual([
    { column: 'id', value: 'trip-1' },
    { column: 'owner_id', value: 'owner-1' },
  ])
  expect(adminState.lastUpdateSelect).toBe('id')
})
