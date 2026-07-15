import { getTripEstimatedCostUsd, recordApiUsageEvent } from '@/lib/apiUsageEvents'
import { runWithTripId, currentTripId } from '@/lib/apiUsageContext'

interface Row {
  estimated_cost_usd: number | null
}

const state: {
  rows: Row[]
  error: unknown
  eqCalls: Array<[string, unknown]>
  inserted: Array<Record<string, unknown>>
} = { rows: [], error: null, eqCalls: [], inserted: [] }

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        state.inserted.push(row)
        return Promise.resolve({ error: state.error })
      },
      select: () => {
        const builder = {
          eq: (col: string, val: unknown) => {
            state.eqCalls.push([col, val])
            return builder
          },
          then: (resolve: (value: { data: Row[] | null; error: unknown }) => unknown) =>
            resolve({ data: state.error ? null : state.rows, error: state.error }),
        }
        return builder
      },
    }),
  }),
}))

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
})

beforeEach(() => {
  state.rows = []
  state.error = null
  state.eqCalls = []
  state.inserted = []
})

describe('getTripEstimatedCostUsd', () => {
  it('sums estimated_cost_usd across rows', async () => {
    state.rows = [{ estimated_cost_usd: 0.017 }, { estimated_cost_usd: 0.032 }, { estimated_cost_usd: 0.005 }]
    await expect(getTripEstimatedCostUsd('trip-1')).resolves.toBeCloseTo(0.054, 6)
  })

  it('treats null cost as 0', async () => {
    state.rows = [{ estimated_cost_usd: 0.017 }, { estimated_cost_usd: null }]
    await expect(getTripEstimatedCostUsd('trip-1')).resolves.toBeCloseTo(0.017, 6)
  })

  it('filters by trip_id and google_maps provider', async () => {
    state.rows = []
    await getTripEstimatedCostUsd('trip-42')
    expect(state.eqCalls).toContainEqual(['trip_id', 'trip-42'])
    expect(state.eqCalls).toContainEqual(['provider', 'google_maps'])
  })

  it('returns 0 for empty tripId (no query)', async () => {
    await expect(getTripEstimatedCostUsd('')).resolves.toBe(0)
    expect(state.eqCalls).toHaveLength(0)
  })

  it('returns 0 on query error (e.g. missing table)', async () => {
    state.error = { code: '42P01' }
    await expect(getTripEstimatedCostUsd('trip-1')).resolves.toBe(0)
  })
})

describe('trip usage context', () => {
  it('currentTripId is null outside any context', () => {
    expect(currentTripId()).toBeNull()
  })

  it('currentTripId reflects the ambient runWithTripId value', () => {
    runWithTripId('trip-abc', () => {
      expect(currentTripId()).toBe('trip-abc')
    })
    expect(currentTripId()).toBeNull()
  })

  it('recordApiUsageEvent attributes the ambient trip when tripId is not passed', async () => {
    process.env.API_USAGE_EVENTS_MODE = 'on'
    await runWithTripId('trip-ctx', async () => {
      await recordApiUsageEvent({ provider: 'google_maps', endpoint: 'find_place_from_text', skuHint: 'find_place_from_text_id_only' })
    })
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0].trip_id).toBe('trip-ctx')
    delete process.env.API_USAGE_EVENTS_MODE
  })

  it('an explicit tripId still wins over ambient context', async () => {
    process.env.API_USAGE_EVENTS_MODE = 'on'
    await runWithTripId('trip-ctx', async () => {
      await recordApiUsageEvent({ provider: 'google_maps', endpoint: 'x', skuHint: null, tripId: 'trip-explicit' })
    })
    expect(state.inserted[0].trip_id).toBe('trip-explicit')
    delete process.env.API_USAGE_EVENTS_MODE
  })
})
