import type { Candidate, Place } from '@/lib/types'

type AuthUser = { id: string } | null
type QueryResult<T> = { data: T; error: unknown }
type InsertPayload = { trip_id: string; place: Place; added_by: string; source?: unknown }
type CandidateRow = { id: string; place: Place; added_by: string; created_at: string; source?: unknown }
type UserProfile = {
  email?: string
  user_metadata?: {
    name?: string
    full_name?: string
  }
}
type Predicate = { column: string; value: string }
type OrderCall = { column: string; options: { ascending: boolean } }

type TestState = {
  authUser: AuthUser
  insertResult: QueryResult<{ id: string } | null>
  adminLookupResult: QueryResult<{ id: string } | null>
  adminInsertError: unknown
  listResult: QueryResult<CandidateRow[] | null>
  deleteResult: QueryResult<{ id: string }[] | null>
  profiles: Record<string, UserProfile | undefined>
  lastInsert: InsertPayload | null
  lastInsertSelect: string | null
  lastListSelect: string | null
  lastListPredicate: Predicate | null
  lastListOrder: OrderCall | null
  lastDeletePredicate: Predicate | null
  lastDeleteSelect: string | null
}

let state: TestState

const placeFixture: Place = {
  id: 'place-local-1',
  placeId: 'google-place-1',
  name: 'Test Cafe',
  type: 'restaurant',
  lat: 25.033,
  lng: 121.5654,
  address: 'Taipei 101',
  openingHours: ['Monday: 9:00 AM - 5:00 PM'],
  rating: 4.6,
  photoUrl: 'https://example.com/place.jpg',
  description: 'A typed place fixture',
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: state.authUser } })),
    },
    from: jest.fn((table: string) => {
      if (table === 'trip_candidates') return makeCandidatesBuilder()
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
      if (table === 'trip_candidates') return makeAdminCandidatesBuilder()
      throw new Error(`Unexpected admin table ${table}`)
    }),
  }),
}))

function makeAdminCandidatesBuilder() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => state.adminLookupResult),
        })),
      })),
    })),
    insert: jest.fn((payload: InsertPayload) => {
      state.lastInsert = payload
      return Promise.resolve({ data: null, error: state.adminInsertError })
    }),
  }
}

function makeCandidatesBuilder() {
  return {
    insert: jest.fn((payload: InsertPayload) => {
      state.lastInsert = payload
      return {
        select: jest.fn((columns: string) => {
          state.lastInsertSelect = columns
          return {
            single: jest.fn(async () => state.insertResult),
          }
        }),
      }
    }),
    select: jest.fn((columns: string) => {
      state.lastListSelect = columns
      return {
        eq: jest.fn((column: string, value: string) => {
          state.lastListPredicate = { column, value }
          return {
            order: jest.fn(async (orderColumn: string, options: { ascending: boolean }) => {
              state.lastListOrder = { column: orderColumn, options }
              return state.listResult
            }),
          }
        }),
      }
    }),
    delete: jest.fn(() => ({
      eq: jest.fn((column: string, value: string) => {
        state.lastDeletePredicate = { column, value }
        return {
          select: jest.fn(async (columns: string) => {
            state.lastDeleteSelect = columns
            return state.deleteResult
          }),
        }
      }),
    })),
  }
}

function loadActions() {
  return require('@/app/actions/candidates') as typeof import('@/app/actions/candidates')
}

beforeEach(() => {
  state = {
    authUser: { id: 'user-self' },
    insertResult: { data: { id: 'candidate-1' }, error: null },
    adminLookupResult: { data: null, error: null },
    adminInsertError: null,
    listResult: {
      data: [
        {
          id: 'candidate-1',
          place: placeFixture,
          added_by: 'user-a',
          created_at: '2026-07-04T01:00:00.000Z',
        },
        {
          id: 'candidate-2',
          place: { ...placeFixture, id: 'place-local-2', placeId: 'google-place-2', name: 'Second Cafe' },
          added_by: 'user-b',
          created_at: '2026-07-04T02:00:00.000Z',
        },
      ],
      error: null,
    },
    deleteResult: { data: [{ id: 'candidate-1' }], error: null },
    profiles: {
      'user-a': {
        email: 'a@example.com',
        user_metadata: { name: 'Alice' },
      },
      'user-b': {
        email: 'b@example.com',
        user_metadata: { name: 'Bob' },
      },
    },
    lastInsert: null,
    lastInsertSelect: null,
    lastListSelect: null,
    lastListPredicate: null,
    lastListOrder: null,
    lastDeletePredicate: null,
    lastDeleteSelect: null,
  }
  jest.resetModules()
})

it('addCandidate throws NOT_AUTHENTICATED when logged out', async () => {
  state.authUser = null

  const { addCandidate } = loadActions()

  await expect(addCandidate('trip-1', placeFixture)).rejects.toThrow('NOT_AUTHENTICATED')
})

it('addCandidate returns { id } on success', async () => {
  const { addCandidate } = loadActions()

  await expect(addCandidate('trip-1', placeFixture)).resolves.toEqual({ id: 'candidate-1' })

  expect(state.lastInsert).toEqual({ trip_id: 'trip-1', place: placeFixture, added_by: 'user-self' })
  expect(state.lastInsertSelect).toBe('id')
})

it('addCandidate throws localized failure when insert returns error', async () => {
  state.insertResult = { data: null, error: { message: 'insert failed' } }

  const { addCandidate } = loadActions()

  await expect(addCandidate('trip-1', placeFixture)).rejects.toThrow('加入失敗，請稍後再試')
})

it('addCandidate throws localized failure when insert returns no data', async () => {
  state.insertResult = { data: null, error: null }

  const { addCandidate } = loadActions()

  await expect(addCandidate('trip-1', placeFixture)).rejects.toThrow('加入失敗，請稍後再試')
})

it('listCandidates returns [] when logged out', async () => {
  state.authUser = null

  const { listCandidates } = loadActions()

  await expect(listCandidates('trip-1')).resolves.toEqual([])
})

it('listCandidates returns [] when RLS hides rows', async () => {
  state.listResult = { data: [], error: null }

  const { listCandidates } = loadActions()

  await expect(listCandidates('trip-hidden')).resolves.toEqual([])
})

it('listCandidates maps rows to Candidate[] with names from user_metadata.name', async () => {
  const expected: Candidate[] = [
    { id: 'candidate-1', place: placeFixture, addedBy: 'user-a', addedByName: 'Alice' },
    {
      id: 'candidate-2',
      place: { ...placeFixture, id: 'place-local-2', placeId: 'google-place-2', name: 'Second Cafe' },
      addedBy: 'user-b',
      addedByName: 'Bob',
    },
  ]

  const { listCandidates } = loadActions()

  await expect(listCandidates('trip-1')).resolves.toEqual(expected)

  expect(state.lastListSelect).toBe('id, place, added_by, created_at, source')
  expect(state.lastListPredicate).toEqual({ column: 'trip_id', value: 'trip-1' })
  expect(state.lastListOrder).toEqual({ column: 'created_at', options: { ascending: true } })
})

it('listCandidates maps source metadata when present', async () => {
  state.listResult = {
    data: [{
      id: 'candidate-1',
      place: placeFixture,
      added_by: 'user-a',
      created_at: '2026-07-04T01:00:00.000Z',
      source: {
        kind: 'line_group',
        lineGroupId: 'Cg123',
        lineDisplayName: '小明',
        messageId: 'm1',
      },
    } as CandidateRow & { source: unknown }],
    error: null,
  }

  const { listCandidates } = loadActions()

  await expect(listCandidates('trip-1')).resolves.toEqual([{
    id: 'candidate-1',
    place: placeFixture,
    addedBy: 'user-a',
    addedByName: 'Alice',
    source: {
      kind: 'line_group',
      lineGroupId: 'Cg123',
      lineDisplayName: '小明',
      messageId: 'm1',
    },
  }])

  expect(state.lastListSelect).toBe('id, place, added_by, created_at, source')
})

it('addCandidateFromLine inserts with source and writeAsUserId', async () => {
  const source = { kind: 'line_group' as const, lineGroupId: 'Cg123', messageId: 'm1' }
  const { addCandidateFromLine } = loadActions()

  await expect(addCandidateFromLine({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place: placeFixture,
    source,
  })).resolves.toBe('added')

  expect(state.lastInsert).toEqual({
    trip_id: 'trip-1',
    place: placeFixture,
    added_by: 'owner-1',
    source,
  })
})

it('addCandidateFromLine throws and skips insert when duplicate lookup fails', async () => {
  state.adminLookupResult = { data: null, error: { message: 'lookup failed' } }
  const source = { kind: 'line_group' as const, lineGroupId: 'Cg123', messageId: 'm1' }
  const { addCandidateFromLine } = loadActions()

  await expect(addCandidateFromLine({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place: placeFixture,
    source,
  })).rejects.toThrow('LINE_CANDIDATE_LOOKUP_FAILED')

  expect(state.lastInsert).toBeNull()
})

it('addCandidateFromLine treats insert unique violations as duplicate', async () => {
  state.adminInsertError = { code: '23505', message: 'duplicate candidate' }
  const source = { kind: 'line_group' as const, lineGroupId: 'Cg123', messageId: 'm1' }
  const { addCandidateFromLine } = loadActions()

  await expect(addCandidateFromLine({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place: placeFixture,
    source,
  })).resolves.toBe('duplicate')
})

it('removeCandidate throws NOT_AUTHENTICATED when logged out', async () => {
  state.authUser = null

  const { removeCandidate } = loadActions()

  await expect(removeCandidate('candidate-1')).rejects.toThrow('NOT_AUTHENTICATED')
})

it('removeCandidate throws localized failure when 0 rows are deleted', async () => {
  state.deleteResult = { data: [], error: null }

  const { removeCandidate } = loadActions()

  await expect(removeCandidate('candidate-1')).rejects.toThrow('移除失敗，請稍後再試')
})

it('removeCandidate resolves undefined on successful delete', async () => {
  const { removeCandidate } = loadActions()

  await expect(removeCandidate('candidate-1')).resolves.toBeUndefined()

  expect(state.lastDeletePredicate).toEqual({ column: 'id', value: 'candidate-1' })
  expect(state.lastDeleteSelect).toBe('id')
})
