import type { Candidate, CandidateSource, Place } from '@/lib/types'

type AuthUser = { id: string } | null
type QueryResult<T> = { data: T; error: unknown }
type InsertPayload = Record<string, unknown>
type CandidateRow = { id: string; place: Place; added_by: string; source?: CandidateSource | null; created_at: string }
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
  insertError: { message: string; code?: string } | null
  listResult: QueryResult<CandidateRow[] | null>
  deleteResult: QueryResult<{ id: string }[] | null>
  profiles: Record<string, UserProfile | undefined>
  lastInsert: InsertPayload | null
  lastInsertSelect: string | null
  lastListSelect: string | null
  lastListPredicates: Predicate[]
  lastListOrder: OrderCall | null
  lastDeletePredicate: Predicate | null
  lastDeleteSelect: string | null
  updateResult: QueryResult<{ id: string } | null>
  updateError: { message: string; code?: string } | null
  lastUpdate: InsertPayload | null
  lastUpdatePredicates: Predicate[]
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
  }),
}))

function makeCandidatesBuilder() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential test mock, same pattern as trips-actions.test.ts
  const chain: any = {
    eq: jest.fn((column: string, value: string) => {
      state.lastListPredicates.push({ column, value })
      return {
        eq: chain.eq,
        order: jest.fn(async (orderColumn: string, options: { ascending: boolean }) => {
          state.lastListOrder = { column: orderColumn, options }
          return state.listResult
        }),
      }
    }),
  }
  return {
    insert: jest.fn((payload: InsertPayload) => {
      state.lastInsert = payload
      return {
        select: jest.fn((columns: string) => {
          state.lastInsertSelect = columns
          return {
            single: jest.fn(async () => (state.insertError ? { data: null, error: state.insertError } : state.insertResult)),
          }
        }),
      }
    }),
    select: jest.fn((columns: string) => {
      state.lastListSelect = columns
      return chain
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
    update: jest.fn((payload: InsertPayload) => {
      state.lastUpdate = payload
      const predicates: Predicate[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- self-referential test mock
      const updateChain: any = {
        eq: jest.fn((column: string, value: string) => {
          predicates.push({ column, value })
          state.lastUpdatePredicates = [...predicates]
          return {
            eq: updateChain.eq,
            select: jest.fn(() => ({
              single: jest.fn(async () => (state.updateError ? { data: null, error: state.updateError } : state.updateResult)),
            })),
          }
        }),
      }
      return updateChain
    }),
  }
}

function loadActions() {
  return require('@/app/actions/candidates') as typeof import('@/app/actions/candidates')
}

beforeEach(() => {
  state = {
    authUser: { id: 'user-self' },
    insertResult: { data: { id: 'candidate-1' }, error: null },
    insertError: null,
    listResult: {
      data: [
        {
          id: 'candidate-1',
          place: placeFixture,
          added_by: 'user-a',
          source: { kind: 'line_group', lineGroupId: 'group-1', messageId: 'msg-1' },
          created_at: '2026-07-04T01:00:00.000Z',
        },
        {
          id: 'candidate-2',
          place: { ...placeFixture, id: 'place-local-2', placeId: 'google-place-2', name: 'Second Cafe' },
          added_by: 'user-b',
          source: null,
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
    lastListPredicates: [],
    lastListOrder: null,
    lastDeletePredicate: null,
    lastDeleteSelect: null,
    updateResult: { data: { id: 'candidate-1' }, error: null },
    updateError: null,
    lastUpdate: null,
    lastUpdatePredicates: [],
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

it('listCandidates maps only LINE-sourced rows to read-only discussion candidates', async () => {
  const expected: Candidate[] = [
    {
      id: 'candidate-1',
      place: placeFixture,
      addedBy: 'user-a',
      addedByName: 'Alice',
      source: { kind: 'line_group', lineGroupId: 'group-1', messageId: 'msg-1' },
    },
  ]

  const { listCandidates } = loadActions()

  await expect(listCandidates('trip-1')).resolves.toEqual(expected)

  expect(state.lastListSelect).toBe('id, place, added_by, source, created_at')
  expect(state.lastListPredicates).toEqual([
    { column: 'trip_id', value: 'trip-1' },
    { column: 'list', value: 'candidate' },
  ])
  expect(state.lastListOrder).toEqual({ column: 'created_at', options: { ascending: true } })
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

// --- TASK-022: archivePlace / listArchived / unarchivePlace ---

it('archivePlace throws NOT_AUTHENTICATED when logged out', async () => {
  state.authUser = null

  const { archivePlace } = loadActions()

  await expect(archivePlace('trip-1', placeFixture)).rejects.toThrow('NOT_AUTHENTICATED')
})

it('archivePlace inserts with list=archived and the place_id for dedup', async () => {
  const { archivePlace } = loadActions()

  await expect(archivePlace('trip-1', placeFixture)).resolves.toEqual({ id: 'candidate-1' })

  expect(state.lastInsert).toEqual({
    trip_id: 'trip-1',
    place: placeFixture,
    place_id: placeFixture.placeId,
    added_by: 'user-self',
    list: 'archived',
  })
})

it('archivePlace flips an existing row (candidate or already-archived) to archived on a duplicate-key conflict, instead of a silent no-op', async () => {
  state.insertError = { message: 'duplicate key value violates unique constraint', code: '23505' }
  state.updateResult = { data: { id: 'existing-row-1' }, error: null }

  const { archivePlace } = loadActions()

  await expect(archivePlace('trip-1', placeFixture)).resolves.toEqual({ id: 'existing-row-1' })

  expect(state.lastUpdate).toEqual({ list: 'archived' })
  expect(state.lastUpdatePredicates).toEqual([
    { column: 'trip_id', value: 'trip-1' },
    { column: 'place_id', value: placeFixture.placeId },
  ])
})

it('archivePlace throws localized failure if the duplicate-key fallback update also fails', async () => {
  state.insertError = { message: 'duplicate key value violates unique constraint', code: '23505' }
  state.updateError = { message: 'update failed' }

  const { archivePlace } = loadActions()

  await expect(archivePlace('trip-1', placeFixture)).rejects.toThrow('封存失敗，請稍後再試')
})

it('archivePlace throws localized failure for a non-duplicate insert error', async () => {
  state.insertError = { message: 'insert failed' }

  const { archivePlace } = loadActions()

  await expect(archivePlace('trip-1', placeFixture)).rejects.toThrow('封存失敗，請稍後再試')
})

it('listArchived filters to list=archived and maps rows the same way as listCandidates', async () => {
  const { listArchived } = loadActions()

  const expected: Candidate[] = [
    { id: 'candidate-1', place: placeFixture, addedBy: 'user-a', addedByName: 'Alice', source: { kind: 'line_group', lineGroupId: 'group-1', messageId: 'msg-1' } },
    {
      id: 'candidate-2',
      place: { ...placeFixture, id: 'place-local-2', placeId: 'google-place-2', name: 'Second Cafe' },
      addedBy: 'user-b',
      addedByName: 'Bob',
      source: null,
    },
  ]

  await expect(listArchived('trip-1')).resolves.toEqual(expected)

  expect(state.lastListPredicates).toEqual([
    { column: 'trip_id', value: 'trip-1' },
    { column: 'list', value: 'archived' },
  ])
})

it('listArchived returns [] when logged out', async () => {
  state.authUser = null

  const { listArchived } = loadActions()

  await expect(listArchived('trip-1')).resolves.toEqual([])
})

it('unarchivePlace deletes the row by id, same as removeCandidate', async () => {
  const { unarchivePlace } = loadActions()

  await expect(unarchivePlace('candidate-1')).resolves.toBeUndefined()

  expect(state.lastDeletePredicate).toEqual({ column: 'id', value: 'candidate-1' })
})

it('unarchivePlace throws NOT_AUTHENTICATED when logged out', async () => {
  state.authUser = null

  const { unarchivePlace } = loadActions()

  await expect(unarchivePlace('candidate-1')).rejects.toThrow('NOT_AUTHENTICATED')
})
