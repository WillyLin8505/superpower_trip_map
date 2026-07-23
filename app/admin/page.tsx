import Link from 'next/link'
import { getSources } from '@/app/actions/sources'
import { SourceForm } from '@/components/admin/SourceForm'
import { SourceList } from '@/components/admin/SourceList'
import { SaveDiagnosticsPanel } from '@/components/admin/SaveDiagnosticsPanel'
import { isAdminEmail, requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'

export default async function AdminPage() {
  try {
    await requireAdmin()
  } catch {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const email = user?.email ?? null
    const adminEmailsConfigured = Boolean(process.env.ADMIN_EMAILS?.trim())
    const emailAllowed = isAdminEmail(email)

    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="mb-3 text-xl font-semibold text-gray-900">此頁需要管理員權限</h1>
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-gray-700">
          <p>目前登入 email：{email ?? '尚未登入'}</p>
          <p>Vercel ADMIN_EMAILS：{adminEmailsConfigured ? '已設定' : '未設定'}</p>
          <p>目前 email 是否在 allowlist：{emailAllowed ? '是' : '否'}</p>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          請用管理員 email 登入，或在 Vercel Environment Variables 設定 `ADMIN_EMAILS`。
        </p>
        {!email && (
          <Link
            href="/login?next=/admin"
            className="mt-4 inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            登入後台
          </Link>
        )}
      </main>
    )
  }

  const sources = await getSources()
  const recommendationCount = sources.filter((source) => source.kind === 'recommendation').length
  const imageCount = sources.filter((source) => source.kind === 'image').length

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">後台管理</h1>
      <p className="mb-8 text-sm text-gray-500">
        管理行程推薦文章來源與圖片來源網站。圖片來源會獨立管理，不會被拿去產生行程推薦文字。
      </p>
      <SaveDiagnosticsPanel />
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-gray-700">新增來源網站</h2>
        <SourceForm />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-700">
          來源設定（推薦 {recommendationCount} 個，圖片 {imageCount} 個）
        </h2>
        <SourceList sources={sources} />
      </section>
    </main>
  )
}
