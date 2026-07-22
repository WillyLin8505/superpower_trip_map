jest.mock('fs/promises', () => ({ readFile: jest.fn() }))

function makeBuilder(overrides: { data?: unknown; error?: unknown } = {}) {
  const builder: any = {
    select: jest.fn(() => builder),
    order: jest.fn(async () => ({
      data: overrides.data ?? [],
      error: overrides.error ?? null,
    })),
  }
  return builder
}

let builder: ReturnType<typeof makeBuilder>
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: jest.fn(() => builder) }),
}))

import { readFile } from 'fs/promises'
import { getRecommendationSources } from '@/lib/recommendationSources'

const rf = readFile as jest.Mock
const OLD_ENV = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = {
    ...OLD_ENV,
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  }
  builder = makeBuilder()
  rf.mockResolvedValue('[]')
})

afterEach(() => {
  process.env = OLD_ENV
})

it('loads recommendation sources from Supabase first', async () => {
  builder = makeBuilder({
    data: [{
      id: 's1',
      url: 'https://travel.example/osaka',
      label: '大阪旅遊',
      last_fetched_at: '2026-07-22T00:00:00Z',
      last_fetch_status: 'ok',
    }],
  })

  await expect(getRecommendationSources()).resolves.toEqual([{
    id: 's1',
    url: 'https://travel.example/osaka',
    label: '大阪旅遊',
    lastFetchedAt: '2026-07-22T00:00:00Z',
    lastFetchStatus: 'ok',
  }])
  expect(rf).not.toHaveBeenCalled()
})

it('falls back to config/sources.json when Supabase admin env is unavailable', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  rf.mockResolvedValue(JSON.stringify([{
    id: 'local-1',
    url: 'https://local.example',
    label: 'Local',
    lastFetchedAt: null,
    lastFetchStatus: null,
  }]))

  await expect(getRecommendationSources()).resolves.toEqual([{
    id: 'local-1',
    url: 'https://local.example',
    label: 'Local',
    lastFetchedAt: null,
    lastFetchStatus: null,
  }])
})

it('falls back to config/sources.json when Supabase read fails', async () => {
  builder = makeBuilder({ data: null, error: { message: 'boom' } })
  rf.mockResolvedValue(JSON.stringify([{
    id: 'local-1',
    url: 'https://local.example',
    label: 'Local',
    lastFetchedAt: null,
    lastFetchStatus: null,
  }]))

  await expect(getRecommendationSources()).resolves.toEqual([{
    id: 'local-1',
    url: 'https://local.example',
    label: 'Local',
    lastFetchedAt: null,
    lastFetchStatus: null,
  }])
})
