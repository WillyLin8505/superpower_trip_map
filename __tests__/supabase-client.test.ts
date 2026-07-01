const createBrowserClient = jest.fn(() => ({ __kind: 'browser' }))
jest.mock('@supabase/ssr', () => ({ createBrowserClient: (...a: unknown[]) => createBrowserClient(...a) }))

describe('browser supabase client', () => {
  beforeEach(() => {
    createBrowserClient.mockClear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('constructs the browser client with url + anon key', () => {
    const { createClient } = require('@/lib/supabase/client')
    createClient()
    expect(createBrowserClient).toHaveBeenCalledWith('https://x.supabase.co', 'anon-key')
  })
})
