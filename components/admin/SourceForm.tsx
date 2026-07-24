'use client'
import { useState } from 'react'
import { addSource } from '@/app/actions/sources'
import {
  IMAGE_SOURCE_PROVIDER_OPTIONS,
  IMAGE_SOURCE_SCOPE_OPTIONS,
  SOURCE_KIND_OPTIONS,
  imageSourceProviderLabel,
  imageSourceScopeLabel,
  sourceKindLabel,
} from '@/lib/sourceConfig'
import type { SourceKind } from '@/lib/types'

export function SourceForm() {
  const [kind, setKind] = useState<SourceKind>('recommendation')
  const isImage = kind === 'image'

  return (
    <form action={addSource} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[160px_1fr_220px]">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">類型</span>
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
          <span className="mb-1 block text-gray-600">來源 URL</span>
          <input
            name="url"
            type="url"
            placeholder={isImage ? 'https://example.com/photo-source' : 'https://example.com/travel-guide'}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">顯示名稱</span>
          <input
            name="label"
            type="text"
            placeholder={isImage ? '東京官方旅遊 GO TOKYO' : '日本官方旅遊局 JNTO'}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      {isImage && (
        <div className="mt-3 grid gap-3 md:grid-cols-[180px_180px_100px_140px_1fr]">
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">圖片來源</span>
            <select
              name="provider"
              defaultValue="official_website"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {IMAGE_SOURCE_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {imageSourceProviderLabel(provider)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">適用層級</span>
            <select
              name="scope"
              defaultValue="regional_official"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {IMAGE_SOURCE_SCOPE_OPTIONS.map((scope) => (
                <option key={scope} value={scope}>
                  {imageSourceScopeLabel(scope)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">國家</span>
            <input
              name="country"
              placeholder="JP"
              maxLength={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">區域</span>
            <input
              name="region"
              placeholder="Tokyo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">適用條件</span>
            <input
              name="condition"
              placeholder="country=JP AND region=Tokyo"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-[120px_1fr_auto_auto]">
        {isImage && (
          <label className="text-sm">
            <span className="mb-1 block text-gray-600">排序</span>
            <input
              name="priority"
              type="number"
              min={0}
              step={10}
              placeholder="10"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
        )}
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">備註</span>
          <input
            name="notes"
            placeholder={isImage ? '只取 metadata 圖，不掃整站圖片' : '官方旅遊推薦來源'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 self-end rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
          <input type="hidden" name="enabled" value="false" />
          <input type="checkbox" name="enabled" value="true" defaultChecked />
          啟用
        </label>
        <button
          type="submit"
          className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新增來源
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        圖片來源規則用來描述優先順序與適用條件；實際抓圖仍只使用結構化官方網址與公開精準來源，不會用名稱亂猜官網。
      </p>
    </form>
  )
}
