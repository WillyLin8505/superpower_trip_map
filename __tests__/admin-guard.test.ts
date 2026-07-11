function makeSupabase(user: { email?: string | null } | null) {
  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user } })),
    },
  }
}

let current: ReturnType<typeof makeSupabase>
jest.mock('@/lib/supabase/server', () => ({ createClient: () => current }))

const OLD_ENV = process.env

beforeEach(() => {
  process.env = { ...OLD_ENV }
})
afterEach(() => {
  process.env = OLD_ENV
})

describe('isAdminEmail', () => {
  it('returns false when ADMIN_EMAILS is not set', () => {
    delete process.env.ADMIN_EMAILS
    const { isAdminEmail } = require('@/lib/admin')
    expect(isAdminEmail('a@b.com')).toBe(false)
  })

  it('returns true for an email in the allowlist', () => {
    process.env.ADMIN_EMAILS = 'a@b.com,c@d.com'
    const { isAdminEmail } = require('@/lib/admin')
    expect(isAdminEmail('a@b.com')).toBe(true)
  })

  it('returns false for an email not in the allowlist', () => {
    process.env.ADMIN_EMAILS = 'a@b.com,c@d.com'
    const { isAdminEmail } = require('@/lib/admin')
    expect(isAdminEmail('x@y.com')).toBe(false)
  })

  it('is case-insensitive and trims whitespace on both sides', () => {
    process.env.ADMIN_EMAILS = ' A@B.com , c@d.com '
    const { isAdminEmail } = require('@/lib/admin')
    expect(isAdminEmail('a@b.COM')).toBe(true)
    expect(isAdminEmail('  a@b.com  ')).toBe(true)
  })

  it('returns false for null/undefined email', () => {
    process.env.ADMIN_EMAILS = 'a@b.com'
    const { isAdminEmail } = require('@/lib/admin')
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)
  })
})

describe('requireAdmin', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'admin@x.com'
  })

  it('throws when not logged in', async () => {
    current = makeSupabase(null)
    const { requireAdmin } = require('@/lib/admin')
    await expect(requireAdmin()).rejects.toThrow()
  })

  it('throws when logged in but not on the allowlist', async () => {
    current = makeSupabase({ email: 'nobody@x.com' })
    const { requireAdmin } = require('@/lib/admin')
    await expect(requireAdmin()).rejects.toThrow()
  })

  it('resolves with the user when on the allowlist', async () => {
    current = makeSupabase({ email: 'admin@x.com' })
    const { requireAdmin } = require('@/lib/admin')
    await expect(requireAdmin()).resolves.toEqual({ email: 'admin@x.com' })
  })
})
