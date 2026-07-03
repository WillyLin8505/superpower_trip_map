type AuthUser = { id: string } | null

type QueryResult = { data: unknown; error: unknown }
type UpdateResult = { error: unknown }
type InsertResult = { error: { code?: string } | null }

type AdminState = {
  tripLookup: QueryResult
  ownerLookup: QueryResult
  updateResult: UpdateResult
  insertResult: InsertResult
  lastUpdate: { invite_token: string } | null
  lastUpdateTripId: string | null
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
          value.startsWith('invite-') ? adminState.tripLookup : adminState.ownerLookup,
        ),
      })),
    })),
    update: jest.fn((_values: { invite_token: string }) => ({
      eq: jest.fn(async (_column: string, value: string) => {
        adminState.lastUpdateTripId = value
        return adminState.updateResult
      }),
    })),
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
    ownerLookup: { data: { owner_id: 'owner-1', invite_token: 'invite-existing' }, error: null },
    updateResult: { error: null },
    insertResult: { error: null },
    lastUpdate: null,
    lastUpdateTripId: null,
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
  await expect(getInviteLink('trip-1')).resolves.toEqual({ token: 'invite-existing' })
  expect(adminState.lastUpdateTripId).toBeNull()
})

it('getInviteLink generates and persists a UUID when missing', async () => {
  authUser = { id: 'owner-1' }
  adminState.ownerLookup = { data: { owner_id: 'owner-1', invite_token: null }, error: null }
  jest.spyOn(crypto, 'randomUUID').mockReturnValue('invite-new')
  const { getInviteLink } = loadActions()
  await expect(getInviteLink('trip-1')).resolves.toEqual({ token: 'invite-new' })
  expect(adminState.lastUpdateTripId).toBe('trip-1')
})

it('rotateInvite owner gets a new persisted token', async () => {
  authUser = { id: 'owner-1' }
  jest.spyOn(crypto, 'randomUUID').mockReturnValue('invite-rotated')
  const { rotateInvite } = loadActions()
  await expect(rotateInvite('trip-1')).resolves.toEqual({ token: 'invite-rotated' })
  expect(adminState.lastUpdateTripId).toBe('trip-1')
})

it('rotateInvite throws NOT_OWNER for non-owner', async () => {
  const { rotateInvite } = loadActions()
  await expect(rotateInvite('trip-1')).rejects.toThrow('NOT_OWNER')
})
