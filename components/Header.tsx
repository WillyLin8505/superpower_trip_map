import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { HeaderView } from './HeaderView'

export async function Header() {
  // 未設定金鑰時渲染登出狀態，別建立 client（createServerClient(undefined) 會 throw，
  // 而 Header 在 root layout → 會讓每個頁面伺服器渲染崩潰）。
  if (!isSupabaseConfigured()) return <HeaderView user={null} />
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
