'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import type { Source, SourceKind } from '@/lib/types'
import { deleteSource, editSource, reorderImageSources } from '@/app/actions/sources'
import {
  IMAGE_SOURCE_PROVIDER_OPTIONS,
  IMAGE_SOURCE_SCOPE_OPTIONS,
  imageSourceProviderLabel,
  imageSourceScopeLabel,
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

function scopeLabel(source: Source): string {
  if (source.kind !== 'image') return '-'
  return imageSourceScopeLabel(source.config.scope ?? 'custom')
}

function imageSourceCondition(source: Source): string {
  if (source.kind !== 'image') return '-'
  if (source.config.condition) return source.config.condition

  const parts = []
  if (source.config.country) parts.push(`country=${source.config.country}`)
  if (source.config.region) parts.push(`region=${source.config.region}`)
  if (parts.length > 0) return parts.join(' AND ')

  switch (source.config.scope) {
    case 'regional_official':
      return '地點所在區域符合時優先'
    case 'national_official':
      return '地點所在國家符合時使用'
    case 'public_database':
      return '有結構化 ID 或精準名稱符合時使用'
    case 'public_media':
      return '公開授權圖片且精準名稱符合時使用'
    case 'commercial_directory':
      return '目錄頁可驗證為同一地點時使用'
    default:
      return '自訂'
  }
}

function imageSourcePriority(source: Source, fallbackIndex: number): number {
  return source.config.priority ?? (fallbackIndex + 1) * 10
}

function sortedImageSources(sources: Source[]): Source[] {
  return sources
    .filter((source) => source.kind === 'image')
    .sort((left, right) => {
      const priorityDelta = (left.config.priority ?? Number.MAX_SAFE_INTEGER) -
        (right.config.priority ?? Number.MAX_SAFE_INTEGER)
      if (priorityDelta !== 0) return priorityDelta
      return left.label.localeCompare(right.label, 'zh-Hant')
    })
}

function SourceEditRow({
  source,
  onDone,
}: {
  source: Source
  onDone: () => void
}) {
  const [kind, setKind] = useState<SourceKind>(source.kind)
  const isImage = kind === 'image'

  return (
    <tr className="border-b border-gray-100">
      <td colSpan={8} className="py-3">
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            await editSource(source.id, new FormData(event.currentTarget))
            onDone()
          }}
          className="grid gap-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3 md:grid-cols-[130px_1fr_180px_170px_170px_90px_auto]"
        >
          <select
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as SourceKind)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="recommendation">{sourceKindLabel('recommendation')}</option>
            <option value="image">{sourceKindLabel('image')}</option>
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
            disabled={!isImage}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
          >
            {IMAGE_SOURCE_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {imageSourceProviderLabel(provider)}
              </option>
            ))}
          </select>
          <select
            name="scope"
            defaultValue={source.config.scope ?? 'custom'}
            disabled={!isImage}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
          >
            {IMAGE_SOURCE_SCOPE_OPTIONS.map((scope) => (
              <option key={scope} value={scope}>
                {imageSourceScopeLabel(scope)}
              </option>
            ))}
          </select>
          <input
            name="priority"
            type="number"
            defaultValue={source.config.priority ?? ''}
            disabled={!isImage}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-400"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="hidden" name="enabled" value="false" />
            <input type="checkbox" name="enabled" value="true" defaultChecked={source.enabled} />
            啟用
          </label>
          {isImage && (
            <div className="grid gap-3 md:col-span-7 md:grid-cols-[100px_160px_1fr_1fr]">
              <input
                name="country"
                defaultValue={source.config.country ?? ''}
                placeholder="JP"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
              />
              <input
                name="region"
                defaultValue={source.config.region ?? ''}
                placeholder="Tokyo"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="condition"
                defaultValue={source.config.condition ?? ''}
                placeholder="country=JP AND region=Tokyo"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                name="notes"
                defaultValue={source.config.notes ?? ''}
                placeholder="備註"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          )}
          {!isImage && <input type="hidden" name="notes" defaultValue={source.config.notes ?? ''} />}
          <div className="flex items-center gap-3 md:col-span-7">
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

function RowActions({
  source,
  onEdit,
}: {
  source: Source
  onEdit: () => void
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onEdit}
        className="text-xs text-blue-500 hover:text-blue-700"
      >
        編輯
      </button>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          await deleteSource(source.id)
        }}
      >
        <button
          type="submit"
          className="text-xs text-red-500 hover:text-red-700"
        >
          刪除
        </button>
      </form>
    </div>
  )
}

export function SourceList({ sources }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [imageSources, setImageSources] = useState<Source[]>(() => sortedImageSources(sources))
  const [isPending, startTransition] = useTransition()
  const recommendationSources = useMemo(
    () => sources.filter((source) => source.kind === 'recommendation'),
    [sources],
  )

  useEffect(() => {
    setImageSources(sortedImageSources(sources))
  }, [sources])

  function moveImageSource(targetId: string): void {
    if (!draggingId || draggingId === targetId) return
    const fromIndex = imageSources.findIndex((source) => source.id === draggingId)
    const toIndex = imageSources.findIndex((source) => source.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return

    const nextSources = [...imageSources]
    const [moved] = nextSources.splice(fromIndex, 1)
    nextSources.splice(toIndex, 0, moved)
    setImageSources(nextSources)
    setDraggingId(null)
    startTransition(() => {
      void reorderImageSources(nextSources.map((source) => source.id))
    })
  }

  if (sources.length === 0) {
    return <p className="py-4 text-sm text-gray-400">尚未設定來源。</p>
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">圖片來源規則</h3>
          <span className="text-xs text-gray-400">{isPending ? '儲存排序中…' : '拖拉列可調整優先順序'}</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="whitespace-nowrap px-3 py-2 font-medium">排序</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">來源</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">層級</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">條件</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">URL</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">啟用</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">狀態</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {imageSources.map((source, index) =>
                editingId === source.id ? (
                  <SourceEditRow key={source.id} source={source} onDone={() => setEditingId(null)} />
                ) : (
                  <tr
                    key={source.id}
                    draggable
                    onDragStart={() => setDraggingId(source.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => moveImageSource(source.id)}
                    className="cursor-move border-b border-gray-100 last:border-b-0 hover:bg-orange-50/40"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-gray-500">
                      <span className="mr-2 text-gray-300">⋮⋮</span>
                      {imageSourcePriority(source, index)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-800">{source.label}</div>
                      <div className="text-xs text-gray-400">{providerLabel(source)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-600">{scopeLabel(source)}</td>
                    <td className="min-w-[220px] px-3 py-3 text-gray-500">{imageSourceCondition(source)}</td>
                    <td className="max-w-xs truncate px-3 py-3 text-gray-500">{source.url}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-500">{source.enabled ? '是' : '否'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-400">{statusLabel(source.lastFetchStatus)}</td>
                    <td className="px-3 py-3">
                      <RowActions source={source} onEdit={() => setEditingId(source.id)} />
                    </td>
                  </tr>
                )
              )}
              {imageSources.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-sm text-gray-400">尚未設定圖片來源規則。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">推薦來源</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="whitespace-nowrap px-3 py-2 font-medium">名稱</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">URL</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">啟用</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">狀態</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {recommendationSources.map((source) =>
                editingId === source.id ? (
                  <SourceEditRow key={source.id} source={source} onDone={() => setEditingId(null)} />
                ) : (
                  <tr key={source.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-800">{source.label}</td>
                    <td className="max-w-xs truncate px-3 py-3 text-gray-500">{source.url}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-500">{source.enabled ? '是' : '否'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-gray-400">{statusLabel(source.lastFetchStatus)}</td>
                    <td className="px-3 py-3">
                      <RowActions source={source} onEdit={() => setEditingId(source.id)} />
                    </td>
                  </tr>
                )
              )}
              {recommendationSources.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-sm text-gray-400">尚未設定推薦來源。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
