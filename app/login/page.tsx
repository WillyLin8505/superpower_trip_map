'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { isSupabaseConfigured } from '@/lib/supabase/config'

// LINE 在 Supabase 為自訂 OIDC provider;此 slug 需與 Dashboard 設定一致(見 plan Task 0)。
const LINE_PROVIDER = 'line' as const

function LoginForm() {
  const searchParams = useSearchParams()
  const rawNext = searchParams.get('next') ?? '/trips'
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : '/trips'
  const configured = isSupabaseConfigured()

  function signIn(provider: 'google' | typeof LINE_PROVIDER) {
    // 延後建立 client——未設定金鑰時 createBrowserClient(undefined) 會 throw;
    // 放進 handler 可讓頁面在無金鑰時仍能靜態預渲染 / 正常載入。
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.auth.signInWithOAuth({ provider: provider as any, options: { redirectTo } })
  }

  return (
    <main className="max-w-sm mx-auto px-4 py-16 flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-center">登入以儲存行程</h1>
      {!configured && (
        <p role="alert" className="text-sm text-center text-gray-500">
          登入尚未設定，請稍後再試。
        </p>
      )}
      <button
        onClick={() => signIn('google')}
        disabled={!configured}
        className="border rounded-md py-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        使用 Google 登入
      </button>
      <button
        onClick={() => signIn(LINE_PROVIDER)}
        disabled={!configured}
        className="border rounded-md py-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        使用 LINE 登入
      </button>
    </main>
  )
}

export default function LoginPage() {
  // useSearchParams 需包在 Suspense 內,否則靜態匯出會 CSR-bailout 報錯。
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
