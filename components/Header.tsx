import { createClient } from '@/lib/supabase/server'
import { HeaderView } from './HeaderView'

export async function Header() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const view = user
    ? {
        name:
          (user.user_metadata?.name as string | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          user.email ??
          '使用者',
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      }
    : null
  return <HeaderView user={view} />
}
