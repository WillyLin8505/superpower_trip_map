type QueryResult = { data: unknown; error: unknown }
type InsertResult = { error: unknown }

type CandidateRow = {
  id: string
  trip_id: string
  place_id: string | null
  place: {
    id: string
    placeId: string
    name: string
    type: 'restaurant'
    lat: number
    lng: number
    address: string
    openingHours: string[] | null
    rating: number | null
    photoUrl: string | null
    description: string | null
  }
  added_by: string
  source: {
    kind: 'line_group'
    lineGroupId: string
    lineDisplayName?: string
    messageId: string
  } | null
  added_at: string
}

type AdminState = {
  duplicateLookup: QueryResult
  listLookup: QueryResult
  insertResult: InsertResult
  lastInsert: Record<string, unknown> | null
  duplicatePredicates: Array<{ column: string; value: string }>
  listTripId: string | null
}

let adminState: AdminState

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: jest.fn((table: string) => {
      if (table !== 'trip_candidates') throw new Error(`Unexpected table ${table}`)
      return makeCandidatesBuilder()
    }),
  }),
}))

function makeCandidatesBuilder() {
  return {
    select: jest.fn((columns: string) => {
      if (columns === 'id') {
        const predicates: Array<{ column: string; value: string }> = []
        const builder = {
          eq: jest.fn((column: string, value: string) => {
            predicates.push({ column, value })
            adminState.duplicatePredicates = [...predicates]
            return builder
          }),
          maybeSingle: jest.fn(async () => adminState.duplicateLookup),
        }

        return builder
      }

      if (columns === 'id, trip_id, place_id, place, added_by, source, added_at') {
        const builder = {
          eq: jest.fn((column: string, value: string) => {
            if (column === 'trip_id') adminState.listTripId = value
            return builder
          }),
          order: jest.fn(async () => adminState.listLookup),
        }

        return builder
      }

      throw new Error(`Unexpected select ${columns}`)
    }),
    insert: jest.fn(async (values: Record<string, unknown>) => {
      adminState.lastInsert = values
      return adminState.insertResult
    }),
  }
}

function loadCandidates() {
  return require('@/lib/candidates') as typeof import('@/lib/candidates')
}

function makePlace(placeId = 'place-1') {
  return {
    id: 'client-place-1',
    placeId,
    name: 'Sushi Place',
    type: 'restaurant' as const,
    lat: 35.1,
    lng: 139.1,
    address: 'Tokyo',
    openingHours: null,
    rating: 4.7,
    photoUrl: null,
    description: null,
  }
}

function makeSource() {
  return {
    kind: 'line_group' as const,
    lineGroupId: 'group-1',
    lineDisplayName: 'Mina',
    messageId: 'msg-1',
  }
}

beforeEach(() => {
  adminState = {
    duplicateLookup: { data: null, error: null },
    listLookup: { data: [], error: null },
    insertResult: { error: null },
    lastInsert: null,
    duplicatePredicates: [],
    listTripId: null,
  }
  jest.resetModules()
  jest.restoreAllMocks()
})

it('inserts a LINE candidate with added_by and source metadata', async () => {
  const { addCandidateFromLine } = loadCandidates()

  await expect(
    addCandidateFromLine({
      tripId: 'trip-1',
      writeAsUserId: 'user-1',
      place: makePlace(),
      source: makeSource(),
    }),
  ).resolves.toBe('added')

  expect(adminState.duplicatePredicates).toEqual([
    { column: 'trip_id', value: 'trip-1' },
    { column: 'place_id', value: 'place-1' },
  ])
  expect(adminState.lastInsert).toEqual({
    trip_id: 'trip-1',
    place_id: 'place-1',
    place: makePlace(),
    added_by: 'user-1',
    source: makeSource(),
  })
})

it('returns duplicate when an existing candidate has the same trip_id and place_id', async () => {
  adminState.duplicateLookup = { data: { id: 'candidate-1' }, error: null }
  const { addCandidateFromLine } = loadCandidates()

  await expect(
    addCandidateFromLine({
      tripId: 'trip-1',
      writeAsUserId: 'user-1',
      place: makePlace(),
      source: makeSource(),
    }),
  ).resolves.toBe('duplicate')

  expect(adminState.lastInsert).toBeNull()
})

it('does not treat null placeId candidates as duplicates', async () => {
  const { addCandidateFromLine } = loadCandidates()

  await expect(
    addCandidateFromLine({
      tripId: 'trip-2',
      writeAsUserId: 'user-2',
      place: makePlace(''),
      source: makeSource(),
    }),
  ).resolves.toBe('added')

  expect(adminState.duplicatePredicates).toEqual([])
  expect(adminState.lastInsert).toEqual(
    expect.objectContaining({
      trip_id: 'trip-2',
      place_id: null,
      added_by: 'user-2',
    }),
  )
})

it('listCandidates maps snake_case rows to TripCandidate objects', async () => {
  adminState.listLookup = {
    data: [
      {
        id: 'candidate-2',
        trip_id: 'trip-9',
        place_id: 'place-9',
        place: makePlace('place-9'),
        added_by: 'user-9',
        source: makeSource(),
        added_at: '2026-07-10T08:00:00.000Z',
      } satisfies CandidateRow,
    ],
    error: null,
  }
  const { listCandidates } = loadCandidates()

  await expect(listCandidates('trip-9')).resolves.toEqual([
    {
      id: 'candidate-2',
      tripId: 'trip-9',
      placeId: 'place-9',
      place: makePlace('place-9'),
      addedBy: 'user-9',
      addedByName: null,
      source: makeSource(),
      createdAt: '2026-07-10T08:00:00.000Z',
    },
  ])

  expect(adminState.listTripId).toBe('trip-9')
})
