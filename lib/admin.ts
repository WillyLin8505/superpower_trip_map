import 'server-only'
import { createClient } from '@/lib/supabase/server'

const BUILT_IN_ADMIN_EMAILS = ['sssss971412@gmail.com']

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const envEmails = process.env.ADMIN_EMAILS
    ?.split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean) ?? []
  const allowlist = [...BUILT_IN_ADMIN_EMAILS, ...envEmails]
  return allowlist.includes(email.trim().toLowerCase())
}

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    throw new Error('NOT_ADMIN')
  }
  return user
}
