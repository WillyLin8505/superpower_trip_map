const ORIGINAL_ENV = process.env

describe('supabase config', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = { ...ORIGINAL_ENV }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  const loadIsSupabaseConfigured = () => {
    const { isSupabaseConfigured } = require('@/lib/supabase/config')
    return isSupabaseConfigured as () => boolean
  }

  it('returns true when url and anon key are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    expect(loadIsSupabaseConfigured()()).toBe(true)
  })

  it('returns false when url is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

    expect(loadIsSupabaseConfigured()()).toBe(false)
  })

  it('returns false when anon key is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    expect(loadIsSupabaseConfigured()()).toBe(false)
  })

  it('returns false when both values are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    expect(loadIsSupabaseConfigured()()).toBe(false)
  })

  it('returns false when values are empty strings', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''

    expect(loadIsSupabaseConfigured()()).toBe(false)
  })
})
