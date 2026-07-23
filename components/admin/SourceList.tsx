'use client'
import { useState } from 'react'
import type { Source, SourceKind } from '@/lib/types'
import { deleteSource, editSource } from '@/app/actions/sources'
import {
  IMAGE_SOURCE_PROVIDER_OPTIONS,
  SOURCE_KIND_OPTIONS,
  imageSourceProviderLabel,
  sourceKindLabel,
} from '@/lib/sourceConfig'

interface Props {
  sources: Source[]
}

function statusLabel(status: Source['lastFetchStatus']): string {
  if (status === 'ok') return 'OK'
  if (status === 'error') return 'Error'
  return '尚未抓取'
}

function providerLabel(source: Source): string {
  if (source.kind !== 'image') return '-'
  return imageSourceProviderLabel(source.config.provider ?? 'custom')
}

function SourceEditRow({
  source,
  onDone,
}: {
  source: Source
  onDone: () => void
}) {
  const [kind, setKind] = useState<SourceKind>(source.kind)

  return (
    <tr className="border-b border-gray-100">
      <td colSpan={7} className="py-3">
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            await editSource(source.id, new FormData(event.currentTarget))
            onDone()
          }}
          className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 md:grid-cols-[150px_1fr_180px_170px_90px_auto]"
        >
          <select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as SourceKind)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {SOURCE_KIND_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {sourceKindLabel(option)}
              </option>
            ))}
          </select>
          <input
            name="url"
            type="url"
            defaultValue={source.url}
            required
            className="min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="label"
            type="text"
            defaultValue={source.label}
            required
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            name="provider"
            defaultValue={source.config.provider ?? 'custom'}
            disabled={kind !== 'image'}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
          >
            {IMAGE_SOURCE_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {imageSourceProviderLabel(provider)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="hidden" name="enabled" value="false" />
            <input type="checkbox" name="enabled" value="true" defaultChecked={source.enabled} />
            啟用
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
            >
              儲存
            </button>
            <button
              type="button"
              onClick={onDone}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              取消
            </button>
          </div>
        </form>
      </td>
    </tr>
  )
}

export function SourceList({ sources }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)

  if (sources.length === 0) {
    return <p className="py-4 text-sm text-gray-400">目前沒有來源設定。</p>
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="whitespace-nowrap px-3 py-2 font-medium">用途</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">名稱</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">URL</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">圖片提供者</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">啟用</th>
            <th className="whitespace-nowrap px-3 py-2 font-medium">狀態</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {sources.map((source) =>
            editingId === source.id ? (
              <SourceEditRow key={source.id} source={source} onDone={() => setEditingId(null)} />
            ) : (
              <tr key={source.id} className="border-b border-gray-100 last:border-b-0">
                <td className="whitespace-nowrap px-3 py-3 text-gray-700">{sourceKindLabel(source.kind)}</td>
                <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-800">{source.label}</td>
                <td className="max-w-xs truncate px-3 py-3 text-gray-500">{source.url}</td>
                <td className="whitespace-nowrap px-3 py-3 text-gray-500">{providerLabel(source)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-gray-500">{source.enabled ? '是' : '否'}</td>
                <td className="whitespace-nowrap px-3 py-3 text-gray-400">{statusLabel(source.lastFetchStatus)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(source.id)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      編輯
                    </button>
                    <form action={deleteSource.bind(null, source.id)}>
                      <button
                        type="submit"
                        className="text-xs text-red-500 hover:text-red-700"
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
    </div>
  )
}
