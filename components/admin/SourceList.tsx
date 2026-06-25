'use client'
import type { Source } from '@/lib/types'
import { deleteSource } from '@/app/actions/sources'

interface Props {
  sources: Source[]
}

export function SourceList({ sources }: Props) {
  if (sources.length === 0) {
    return <p className="text-gray-400 text-sm py-4">尚未設定任何參考網站</p>
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b border-gray-200">
          <th className="pb-2 font-medium">標籤</th>
          <th className="pb-2 font-medium">URL</th>
          <th className="pb-2 font-medium">狀態</th>
          <th className="pb-2" />
        </tr>
      </thead>
      <tbody>
        {sources.map((s) => (
          <tr key={s.id} className="border-b border-gray-100">
            <td className="py-3 font-medium text-gray-800">{s.label}</td>
            <td className="py-3 text-gray-500 max-w-xs truncate">{s.url}</td>
            <td className="py-3 text-gray-400">{s.lastFetchStatus ?? '未爬取'}</td>
            <td className="py-3">
              <form action={deleteSource.bind(null, s.id)}>
                <button
                  type="submit"
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  刪除
                </button>
              </form>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
