// 迴歸測試：未設定 Supabase 金鑰時，middleware 必須優雅降級（不呼叫 createServerClient、不 throw），
// 否則每個路由都會 MIDDLEWARE_INVOCATION_FAILED（含匿名首頁）。見 lib/supabase/config.ts。

const createServerClient = jest.fn(() => ({
  auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
}))
jest.mock('@supabase/ssr', () => ({
  createServerClient: (...a: unknown[]) => createServerClient(...a),
}))

const nextResult = { cookies: { set: jest.fn() } }
jest.mock('next/server', () => ({
  NextResponse: { next: jest.fn(() => nextResult) },
}))

const makeRequest = () =>
  ({ cookies: { getAll: () => [], set: jest.fn() } } as unknown as import('next/server').NextRequest)

describe('middleware supabase env guard', () => {
  const OLD = { ...process.env }
  beforeEach(() => {
    jest.resetModules()
    createServerClient.mockClear()
  })
  afterEach(() => {
    process.env = { ...OLD }
  })

  it('skips session refresh (no client) when env is unset', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const { middleware } = require('@/middleware')
    await expect(middleware(makeRequest())).resolves.toBe(nextResult)
    expect(createServerClient).not.toHaveBeenCalled()
  })

  it('refreshes session (builds client) when env is present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    const { middleware } = require('@/middleware')
    await middleware(makeRequest())
    expect(createServerClient).toHaveBeenCalledTimes(1)
  })
})
