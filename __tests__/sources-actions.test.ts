// Chainable Supabase mock builder, same pattern as __tests__/trips-actions.test.ts.
function makeBuilder(overrides: { select?: unknown; mutate?: unknown } = {}) {
  const order = jest.fn(async () => overrides.select ?? { data: [], error: null })
  const eqMutate = jest.fn(async () => overrides.mutate ?? { data: [{ id: 's1' }], error: null })
  const insertResolved = jest.fn(async () => overrides.mutate ?? { data: [{ id: 's1' }], error: null })

  const builder: any = {
    select: jest.fn(() => builder),
    order,
    insert: jest.fn(() => insertResolved()),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    eq: jest.fn(() => eqMutate()),
  }
  return builder
}

let readBuilder: ReturnType<typeof makeBuilder>
let adminBuilder: ReturnType<typeof makeBuilder>
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: jest.fn(() => readBuilder) }),
}))
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: jest.fn(() => adminBuilder) }),
}))

let requireAdminMock: jest.Mock
jest.mock('@/lib/admin', () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}))

jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  readBuilder = makeBuilder()
  adminBuilder = makeBuilder()
  requireAdminMock = jest.fn(async () => ({ email: 'admin@x.com' }))
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(fields).forEach(([key, value]) => fd.set(key, value))
  return fd
}

describe('getSources', () => {
  it('maps source metadata and fetch status to Source objects', async () => {
    readBuilder = makeBuilder({
      select: {
        data: [{
          id: 's1',
          url: 'https://a.com',
          label: 'A',
          kind: 'image',
          enabled: false,
          config: { provider: 'tabelog' },
          last_fetched_at: '2026-07-01T00:00:00Z',
          last_fetch_status: 'ok',
        }],
        error: null,
      },
    })
    const { getSources } = require('@/app/actions/sources')
    const out = await getSources()
    expect(out).toEqual([{
      id: 's1',
      url: 'https://a.com',
      label: 'A',
      kind: 'image',
      enabled: false,
      config: { provider: 'tabelog' },
      lastFetchedAt: '2026-07-01T00:00:00Z',
      lastFetchStatus: 'ok',
    }])
  })

  it('returns an empty array on error', async () => {
    readBuilder = makeBuilder({ select: { data: null, error: { message: 'boom' } } })
    const { getSources } = require('@/app/actions/sources')
    expect(await getSources()).toEqual([])
  })

  it('does not require admin (any logged-in reader can list sources)', async () => {
    const { getSources } = require('@/app/actions/sources')
    await getSources()
    expect(requireAdminMock).not.toHaveBeenCalled()
  })
})

describe('addSource', () => {
  it('throws and does not write when the caller is not admin', async () => {
    requireAdminMock = jest.fn(async () => { throw new Error('NOT_ADMIN') })
    const { addSource } = require('@/app/actions/sources')
    await expect(addSource(formData({ url: 'https://a.com', label: 'A' }))).rejects.toThrow('NOT_ADMIN')
    expect(adminBuilder.insert).not.toHaveBeenCalled()
  })

  it('inserts via the admin client when the caller is admin', async () => {
    const { addSource } = require('@/app/actions/sources')
    await addSource(formData({
      url: 'https://a.com',
      label: 'A',
      kind: 'image',
      provider: 'rebake',
      enabled: 'true',
    }))
    expect(adminBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://a.com',
      label: 'A',
      kind: 'image',
      enabled: true,
      config: { provider: 'rebake' },
    }))
  })
})

describe('editSource', () => {
  it('throws and does not write when the caller is not admin', async () => {
    requireAdminMock = jest.fn(async () => { throw new Error('NOT_ADMIN') })
    const { editSource } = require('@/app/actions/sources')
    await expect(editSource('s1', formData({ url: 'https://b.com', label: 'B' }))).rejects.toThrow('NOT_ADMIN')
    expect(adminBuilder.update).not.toHaveBeenCalled()
  })

  it('updates the matching row via the admin client when admin', async () => {
    const { editSource } = require('@/app/actions/sources')
    await editSource('s1', formData({
      url: 'https://b.com',
      label: 'B',
      kind: 'recommendation',
      enabled: 'false',
    }))
    expect(adminBuilder.update).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://b.com',
      label: 'B',
      kind: 'recommendation',
      enabled: false,
      config: {},
    }))
    expect(adminBuilder.eq).toHaveBeenCalledWith('id', 's1')
  })

  it('is a no-op write for an unknown id (update matches 0 rows, no insert happens)', async () => {
    adminBuilder = makeBuilder({ mutate: { data: [], error: null } })
    const { editSource } = require('@/app/actions/sources')
    await editSource('does-not-exist', formData({ url: 'https://b.com', label: 'B' }))
    expect(adminBuilder.insert).not.toHaveBeenCalled()
  })
})

describe('deleteSource', () => {
  it('throws and does not write when the caller is not admin', async () => {
    requireAdminMock = jest.fn(async () => { throw new Error('NOT_ADMIN') })
    const { deleteSource } = require('@/app/actions/sources')
    await expect(deleteSource('s1')).rejects.toThrow('NOT_ADMIN')
    expect(adminBuilder.delete).not.toHaveBeenCalled()
  })

  it('deletes the matching row via the admin client when admin', async () => {
    const { deleteSource } = require('@/app/actions/sources')
    await deleteSource('s1')
    expect(adminBuilder.delete).toHaveBeenCalled()
    expect(adminBuilder.eq).toHaveBeenCalledWith('id', 's1')
  })
})
