import { getSources } from '@/app/actions/sources'
import { isAdminEmail, requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { SourceList } from '@/components/admin/SourceList'
import { SourceForm } from '@/components/admin/SourceForm'
import { SaveDiagnosticsPanel } from '@/components/admin/SaveDiagnosticsPanel'
import Link from 'next/link'

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
      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-xl font-semibold text-gray-900 mb-3">此頁需要管理員權限</h1>
        <div className="rounded-lg border border-border bg-surface p-4 text-sm text-gray-700">
          <p>目前登入 email：{email ?? '未登入'}</p>
          <p>Vercel `ADMIN_EMAILS`：{adminEmailsConfigured ? '已設定' : '未設定'}</p>
          <p>目前 email 是否在 allowlist：{emailAllowed ? '是' : '否'}</p>
        </div>
        <p className="mt-4 text-sm text-gray-500">
          請使用管理員 email 登入，或在 Vercel Environment Variables 設定 `ADMIN_EMAILS` 後重新整理。
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

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">後台管理</h1>
      <p className="text-gray-500 mb-8 text-sm">
        設定推薦系統的參考網站。系統會在使用者規劃行程時自動爬取這些網站並提供推薦。
      </p>
      <SaveDiagnosticsPanel />
      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-700 mb-3">新增參考網站</h2>
        <SourceForm />
      </section>
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          目前設定的網站（{sources.length} 個）
        </h2>
        <SourceList sources={sources} />
      </section>
    </main>
  )
}
