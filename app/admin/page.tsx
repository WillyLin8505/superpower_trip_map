import { getSources } from '@/app/actions/sources'
import { SourceList } from '@/components/admin/SourceList'
import { SourceForm } from '@/components/admin/SourceForm'

export default async function AdminPage() {
  const sources = await getSources()

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">後台管理</h1>
      <p className="text-gray-500 mb-8 text-sm">
        設定推薦系統的參考網站。系統會在使用者規劃行程時自動爬取這些網站並提供推薦。
      </p>
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
