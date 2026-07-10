import 'server-only'
import { createClient } from '@/lib/supabase/server'

export function isAdminEmail(email: string | null | undefined): boolean {
  const raw = process.env.ADMIN_EMAILS
  if (!raw || !email) return false
  const allowlist = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return allowlist.includes(email.trim().toLowerCase())
}

export async function requireAdmin() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    throw new Error('NOT_ADMIN')
  }
  return user
}
