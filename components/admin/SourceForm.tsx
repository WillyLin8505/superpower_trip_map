'use client'
import { useState } from 'react'
import { addSource } from '@/app/actions/sources'
import {
  IMAGE_SOURCE_PROVIDER_OPTIONS,
  SOURCE_KIND_OPTIONS,
  imageSourceProviderLabel,
  sourceKindLabel,
} from '@/lib/sourceConfig'
import type { SourceKind } from '@/lib/types'

export function SourceForm() {
  const [kind, setKind] = useState<SourceKind>('recommendation')

  return (
    <form action={addSource} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[160px_1fr_220px]">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">用途</span>
          <select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as SourceKind)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            {SOURCE_KIND_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {sourceKindLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">來源網址</span>
          <input
            name="url"
            type="url"
            placeholder={kind === 'image' ? 'https://example.com/photo-source' : 'https://example.com/travel-guide'}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">顯示名稱</span>
          <input
            name="label"
            type="text"
            placeholder={kind === 'image' ? '官方網站 / Tabelog' : '大阪旅遊文章'}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {kind === 'image' && (
          <label className="w-56 text-sm">
            <span className="mb-1 block text-gray-600">圖片提供者</span>
            <select
              name="provider"
              defaultValue="custom"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {IMAGE_SOURCE_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {imageSourceProviderLabel(provider)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
          <input type="hidden" name="enabled" value="false" />
          <input type="checkbox" name="enabled" value="true" defaultChecked />
          啟用
        </label>
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新增來源
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        圖片來源只用來管理可抓圖的網站；推薦來源才會被行程推薦流程讀取。
      </p>
    </form>
  )
}
