'use client'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// LINE 在 Supabase 為自訂 OIDC provider;此 slug 需與 Dashboard 設定一致(見 plan Task 0)。
const LINE_PROVIDER = 'line' as const

export default function LoginPage() {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next') ?? '/trips'
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : '/trips'
  const supabase = createClient()

  function signIn(provider: 'google' | typeof LINE_PROVIDER) {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo } })
  }

  return (
    <main className="max-w-sm mx-auto px-4 py-16 flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-center">登入以儲存行程</h1>
      <button
        onClick={() => signIn('google')}
        className="border rounded-md py-2 hover:bg-gray-50"
      >
        使用 Google 登入
      </button>
      <button
        onClick={() => signIn(LINE_PROVIDER)}
        className="border rounded-md py-2 hover:bg-gray-50"
      >
        使用 LINE 登入
      </button>
    </main>
  )
}
