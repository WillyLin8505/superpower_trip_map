'use client'
import { useState } from 'react'
import type { Source } from '@/lib/types'
import { deleteSource, editSource } from '@/app/actions/sources'

interface Props {
  sources: Source[]
}

export function SourceList({ sources }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)

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
        {sources.map((s) =>
          editingId === s.id ? (
            <tr key={s.id} className="border-b border-gray-100">
              <td colSpan={4} className="py-3">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    await editSource(s.id, new FormData(e.currentTarget))
                    setEditingId(null)
                  }}
                  className="flex gap-2 flex-wrap items-center"
                >
                  <input
                    name="url"
                    type="url"
                    defaultValue={s.url}
                    required
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-0"
                  />
                  <input
                    name="label"
                    type="text"
                    defaultValue={s.label}
                    required
                    className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg text-xs font-medium hover:bg-blue-700 whitespace-nowrap"
                  >
                    儲存
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-gray-500 hover:text-gray-700 text-xs"
                  >
                    取消
                  </button>
                </form>
              </td>
            </tr>
          ) : (
            <tr key={s.id} className="border-b border-gray-100">
              <td className="py-3 font-medium text-gray-800">{s.label}</td>
              <td className="py-3 text-gray-500 max-w-xs truncate">{s.url}</td>
              <td className="py-3 text-gray-400">{s.lastFetchStatus ?? '未爬取'}</td>
              <td className="py-3">
                <div className="flex gap-3 items-center">
                  <button
                    type="button"
                    onClick={() => setEditingId(s.id)}
                    className="text-blue-500 hover:text-blue-700 text-xs"
                  >
                    編輯
                  </button>
                  <form action={deleteSource.bind(null, s.id)}>
                    <button
                      type="submit"
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      刪除
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          )
        )}
      </tbody>
    </table>
  )
}
