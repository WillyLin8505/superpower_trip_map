type AuthUser = { id: string } | null

type QueryResult<T> = { data: T; error: unknown }
type DeleteResult = { error: unknown }
type Predicate = { column: string; value: string }
type MemberRow = { user_id: string; role: string }
type UserProfile = {
  email?: string
  user_metadata?: {
    name?: string
    full_name?: string
    avatar_url?: string
  }
}

type TestState = {
  authUser: AuthUser
  visibleTrip: QueryResult<{ id: string } | null>
  ownerLookup: QueryResult<{ owner_id: string } | null>
  membersLookup: QueryResult<MemberRow[] | null>
  profiles: Record<string, UserProfile | undefined>
  deleteResult: DeleteResult
  lastDeleteTable: string | null
  lastDeletePredicates: Predicate[]
}

let state: TestState

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: state.authUser } })),
    },
    from: jest.fn((table: string) => {
      if (table === 'trips') return makeVisibleTripsBuilder()
      if (table === 'trip_members') return makeDeleteBuilder(table)
      throw new Error(`Unexpected client table ${table}`)
    }),
  }),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        getUserById: jest.fn(async (userId: string) => ({
          data: { user: state.profiles[userId] ? { id: userId, ...state.profiles[userId] } : null },
        })),
      },
    },
    from: jest.fn((table: string) => {
      if (table === 'trips') return makeOwnerTripsBuilder()
      if (table === 'trip_members') return makeMembersBuilder()
      throw new Error(`Unexpected admin table ${table}`)
    }),
  }),
}))

function makeVisibleTripsBuilder() {
  return {
    select: jest.fn((_columns: string) => ({
      eq: jest.fn((_column: string, _value: string) => ({
        single: jest.fn(async () => state.visibleTrip),
      })),
    })),
  }
}

function makeOwnerTripsBuilder() {
  return {
    select: jest.fn((_columns: string) => ({
      eq: jest.fn((_column: string, _value: string) => ({
        single: jest.fn(async () => state.ownerLookup),
      })),
    })),
  }
}

function makeMembersBuilder() {
  return {
    select: jest.fn((_columns: string) => ({
      eq: jest.fn((_column: string, _value: string) => Promise.resolve(state.membersLookup)),
    })),
  }
}

function makeDeleteBuilder(table: string) {
  return {
    delete: jest.fn(() => {
      state.lastDeleteTable = table
      const predicates: Predicate[] = []
      const builder = {
        eq: jest.fn((column: string, value: string) => {
          predicates.push({ column, value })
          state.lastDeletePredicates = [...predicates]
          return predicates.length >= 2 ? Promise.resolve(state.deleteResult) : builder
        }),
      }
      return builder
    }),
  }
}

function loadActions() {
  return require('@/app/actions/members') as typeof import('@/app/actions/members')
}

beforeEach(() => {
  state = {
    authUser: { id: 'user-self' },
    visibleTrip: { data: { id: 'trip-1' }, error: null },
    ownerLookup: { data: { owner_id: 'owner-1' }, error: null },
    membersLookup: {
      data: [
        { user_id: 'editor-1', role: 'editor' },
        { user_id: 'user-self', role: 'editor' },
      ],
      error: null,
    },
    profiles: {
      'owner-1': {
        email: 'owner@example.com',
        user_metadata: { full_name: 'Owner Name', avatar_url: 'https://example.com/owner.png' },
      },
      'editor-1': {
        email: 'editor@example.com',
        user_metadata: { name: 'Editor Name' },
      },
      'user-self': {
        email: 'self@example.com',
        user_metadata: {},
      },
    },
    deleteResult: { error: null },
    lastDeleteTable: null,
    lastDeletePredicates: [],
  }
  jest.resetModules()
})

it('listMembers returns [] when RLS hides the trip', async () => {
  state.visibleTrip = { data: null, error: { message: 'hidden' } }

  const { listMembers } = loadActions()

  await expect(listMembers('trip-hidden')).resolves.toEqual([])
})

it('listMembers returns owner plus editors with resolved names and isSelf flags', async () => {
  const { listMembers } = loadActions()

  await expect(listMembers('trip-1')).resolves.toEqual([
    {
      userId: 'owner-1',
      name: 'Owner Name',
      avatarUrl: 'https://example.com/owner.png',
      role: 'owner',
      isSelf: false,
    },
    {
      userId: 'editor-1',
      name: 'Editor Name',
      avatarUrl: null,
      role: 'editor',
      isSelf: false,
    },
    {
      userId: 'user-self',
      name: 'self@example.com',
      avatarUrl: null,
      role: 'editor',
      isSelf: true,
    },
  ])
})

it('removeMember deletes trip_members by trip_id and user_id', async () => {
  const { removeMember } = loadActions()

  await expect(removeMember('trip-1', 'editor-1')).resolves.toBeUndefined()

  expect(state.lastDeleteTable).toBe('trip_members')
  expect(state.lastDeletePredicates).toEqual([
    { column: 'trip_id', value: 'trip-1' },
    { column: 'user_id', value: 'editor-1' },
  ])
})

it('leaveTrip deletes the current user membership row', async () => {
  const { leaveTrip } = loadActions()

  await expect(leaveTrip('trip-1')).resolves.toBeUndefined()

  expect(state.lastDeleteTable).toBe('trip_members')
  expect(state.lastDeletePredicates).toEqual([
    { column: 'trip_id', value: 'trip-1' },
    { column: 'user_id', value: 'user-self' },
  ])
})

it('leaveTrip throws NOT_AUTHENTICATED when logged out', async () => {
  state.authUser = null

  const { leaveTrip } = loadActions()

  await expect(leaveTrip('trip-1')).rejects.toThrow('NOT_AUTHENTICATED')
})
