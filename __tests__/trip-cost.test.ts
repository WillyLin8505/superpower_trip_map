import { getTripEstimatedCostUsd, recordApiUsageEvent } from '@/lib/apiUsageEvents'
import { runWithTripId, currentTripId } from '@/lib/apiUsageContext'

interface Row {
  estimated_cost_usd: number | null
}

const state: {
  rows: Row[]
  error: unknown
  eqCalls: Array<[string, unknown]>
  inCalls: Array<[string, unknown[]]>
  inserted: Array<Record<string, unknown>>
} = { rows: [], error: null, eqCalls: [], inCalls: [], inserted: [] }

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
          in: (col: string, val: unknown[]) => {
            state.inCalls.push([col, val])
            return builder
          },
          range: (from: number, to: number) => ({
            then: (resolve: (value: { data: Row[] | null; error: unknown }) => unknown) =>
              resolve({ data: state.error ? null : state.rows.slice(from, to + 1), error: state.error }),
          }),
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
  state.inCalls = []
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

  it('pages past the row cap so heavy trips are not undercounted', async () => {
    // 1500 rows × 0.001 = 1.5; a single page (1000) would truncate to 1.0.
    state.rows = Array.from({ length: 1500 }, () => ({ estimated_cost_usd: 0.001 }))
    await expect(getTripEstimatedCostUsd('trip-big')).resolves.toBeCloseTo(1.5, 6)
  })

  it('filters by trip_id and Google API providers', async () => {
    await getTripEstimatedCostUsd('trip-42')
    expect(state.eqCalls).toContainEqual(['trip_id', 'trip-42'])
    expect(state.inCalls).toContainEqual(['provider', ['google_maps', 'google_translate']])
  })

  it('returns 0 for empty tripId (no query)', async () => {
    await expect(getTripEstimatedCostUsd('')).resolves.toBe(0)
    expect(state.eqCalls).toHaveLength(0)
  })

  it('returns 0 on first-page query error (e.g. missing table)', async () => {
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

  it('a nested runWithTripId(undefined) inherits the outer trip (does not erase it)', () => {
    runWithTripId('trip-outer', () => {
      runWithTripId(undefined, () => {
        expect(currentTripId()).toBe('trip-outer')
      })
    })
  })

  it('recordApiUsageEvent attributes the ambient trip when tripId is omitted', async () => {
    process.env.API_USAGE_EVENTS_MODE = 'on'
    await runWithTripId('trip-ctx', async () => {
      await recordApiUsageEvent({ provider: 'google_maps', endpoint: 'find_place_from_text', skuHint: 'find_place_from_text_id_only' })
    })
    expect(state.inserted[0].trip_id).toBe('trip-ctx')
    delete process.env.API_USAGE_EVENTS_MODE
  })

  it('an explicit tripId wins over ambient context', async () => {
    process.env.API_USAGE_EVENTS_MODE = 'on'
    await runWithTripId('trip-ctx', async () => {
      await recordApiUsageEvent({ provider: 'google_maps', endpoint: 'x', skuHint: null, tripId: 'trip-explicit' })
    })
    expect(state.inserted[0].trip_id).toBe('trip-explicit')
    delete process.env.API_USAGE_EVENTS_MODE
  })

  it('an explicit null means "do not attribute" and overrides ambient context', async () => {
    process.env.API_USAGE_EVENTS_MODE = 'on'
    await runWithTripId('trip-ctx', async () => {
      await recordApiUsageEvent({ provider: 'google_maps', endpoint: 'x', skuHint: null, tripId: null })
    })
    expect(state.inserted[0].trip_id).toBeNull()
    delete process.env.API_USAGE_EVENTS_MODE
  })
})
