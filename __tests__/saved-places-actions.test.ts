const state: { user: { id: string } | null; rows: unknown[]; insertedIds: string[] } =
  { user: { id: 'user-1' }, rows: [], insertedIds: [] }
const upsertCall: { rows?: unknown[]; opts?: unknown } = {}
const order = jest.fn(async () => ({ data: state.rows, error: null }))

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      expect(table).toBe('saved_places')
      return {
        upsert: (rows: unknown[], opts: unknown) => {
          upsertCall.rows = rows
          upsertCall.opts = opts
          return { select: async () => ({ data: state.insertedIds.map((place_id) => ({ place_id })), error: null }) }
        },
        select: () => ({ eq: () => ({ order }) }),
      }
    },
  }),
}))
const resolvePlaceEssentials = jest.fn()
jest.mock('@/app/actions/savedPlacesResolve', () => ({
  resolvePlaceEssentials: (...a: unknown[]) => resolvePlaceEssentials(...a),
}))

import { importSavedPlaces, listSavedPlaces } from '@/app/actions/savedPlaces'

beforeEach(() => {
  jest.clearAllMocks()
  state.user = { id: 'user-1' }
  state.insertedIds = []
  resolvePlaceEssentials.mockImplementation(async (title: string) =>
    title === '查無此地' ? null : { placeId: `pid-${title}`, name: title, type: 'restaurant', lat: 1, lng: 2, address: 'addr' })
})

it('imports selected entries as owner-scoped stubs; counts unresolved; upserts with dedup onConflict', async () => {
  state.insertedIds = ['pid-度小月'] // resolved + newly inserted (not a duplicate)
  const entries = [
    { listName: '台南', source: 'takeout_list' as const, title: '度小月', note: null, lat: null, lng: null },
    { listName: '台南', source: 'takeout_list' as const, title: '查無此地', note: null, lat: null, lng: null },
  ]
  const result = await importSavedPlaces(entries)
  expect(result).toEqual({ added: 1, existing: 0, unresolved: 1 })
  expect(upsertCall.opts).toEqual({ onConflict: 'owner_id,list_name,place_id', ignoreDuplicates: true })
  const payload = (upsertCall.rows as Record<string, unknown>[])[0]
  expect(payload).toMatchObject({ owner_id: 'user-1', list_name: '台南', source: 'takeout_list', place_id: 'pid-度小月' })
  expect((payload.place as { type: string }).type).toBe('restaurant')
})

it('reports re-imported existing rows as existing, not added', async () => {
  state.insertedIds = [] // both resolved but already existed → 0 inserted
  const entries = [
    { listName: '台南', source: 'takeout_list' as const, title: '度小月', note: null, lat: null, lng: null },
    { listName: '台南', source: 'takeout_list' as const, title: '牛肉湯', note: null, lat: null, lng: null },
  ]
  expect(await importSavedPlaces(entries)).toEqual({ added: 0, existing: 2, unresolved: 0 })
})

it('isolates a per-row resolver error as unresolved without aborting the import', async () => {
  state.insertedIds = ['pid-度小月']
  resolvePlaceEssentials.mockImplementation(async (title: string) => {
    if (title === '爆炸') throw new Error('google 500')
    return { placeId: `pid-${title}`, name: title, type: 'restaurant', lat: 1, lng: 2, address: 'addr' }
  })
  const entries = [
    { listName: '台南', source: 'takeout_list' as const, title: '度小月', note: null, lat: null, lng: null },
    { listName: '台南', source: 'takeout_list' as const, title: '爆炸', note: null, lat: null, lng: null },
  ]
  expect(await importSavedPlaces(entries)).toEqual({ added: 1, existing: 0, unresolved: 1 })
})

it('throws when logged out', async () => {
  state.user = null
  const entries = [{ listName: 'x', source: 'takeout_list' as const, title: 'a', note: null, lat: null, lng: null }]
  await expect(importSavedPlaces(entries)).rejects.toThrow('NOT_AUTHENTICATED')
})

it('lists saved rows shaped as { id, listName, source, place } (full Place)', async () => {
  const place = { id: 'x', placeId: 'p', name: 'X', type: 'restaurant', lat: 1, lng: 2, address: 'a',
    openingHours: null, rating: null, photoUrl: null, description: null }
  state.rows = [{ id: 'r1', list_name: '台南', source: 'takeout_list', place }]
  const rows = await listSavedPlaces()
  expect(rows[0]).toEqual({ id: 'r1', listName: '台南', source: 'takeout_list', place })
})
