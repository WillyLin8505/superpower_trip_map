'use client'
import { useState } from 'react'
import type { CategoryBuckets, DayRecommendation } from '@/lib/types'
import { DayRecommendations } from './DayRecommendations'
import { parseTakeoutFile, type SavedPlaceEntry } from '@/lib/takeout/parse'
import { importSavedPlaces } from '@/app/actions/savedPlaces'

const EMPTY_BUCKETS: CategoryBuckets = {
  dessert: { shown: [], reserve: [] },
  attraction: { shown: [], reserve: [] },
  restaurant: { shown: [], reserve: [] },
}

interface Props {
  dateIso: string
  buckets?: CategoryBuckets
  onAdd: (rec: DayRecommendation) => void
  onArchive: (rec: DayRecommendation) => void
  onDelete: (rec: DayRecommendation) => void
  onImported: () => void
}

export function CollectionPanel({ dateIso, buckets, onAdd, onArchive, onDelete, onImported }: Props) {
  const [entries, setEntries] = useState<SavedPlaceEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setResult(null)
    try {
      const parsed: SavedPlaceEntry[] = []
      for (const file of Array.from(files)) {
        const text = await file.text()
        parsed.push(...parseTakeoutFile(file.name, text))
      }
      setEntries(parsed)
      setSelected(new Set(parsed.map((_, i) => i)))
    } catch (e) {
      setError(e instanceof Error ? e.message : '檔案解析失敗')
      setEntries([])
    }
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function doImport() {
    const chosen = entries.filter((_, i) => selected.has(i))
    if (chosen.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const r = await importSavedPlaces(chosen)
      setResult(`新增 ${r.added}、已存在 ${r.existing}、找不到 ${r.unresolved}`)
      setEntries([])
      setSelected(new Set())
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯入失敗，請稍後再試')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="collection-panel">
      <section className="border border-border rounded-lg p-3 bg-surface" data-testid="collection-import">
        <p className="text-sm font-medium text-ink">匯入 Google Maps 標籤</p>
        <p className="text-xs text-muted mt-0.5">上傳 Google Takeout 匯出的「已儲存地點」(JSON 或各清單 CSV)。</p>
        <input
          type="file"
          accept=".json,.csv"
          multiple
          data-testid="collection-file"
          className="mt-2 text-xs"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        {error && <p role="alert" className="text-xs text-red-500 mt-1">{error}</p>}
        {result && <p className="text-xs text-clay-deep mt-1" data-testid="collection-result">{result}</p>}
        {entries.length > 0 && (
          <div className="mt-2" data-testid="collection-preview">
            <ul className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {entries.map((entry, i) => (
                <li key={`${entry.listName}:${entry.title}:${i}`} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggle(i)}
                    aria-label={`選擇 ${entry.title}`}
                  />
                  <span className="text-ink">{entry.title}</span>
                  <span className="text-muted">· {entry.listName}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              data-testid="collection-do-import"
              disabled={importing || selected.size === 0}
              onClick={() => void doImport()}
              className="mt-2 rounded-full bg-clay text-white text-xs px-3 py-1 disabled:opacity-50"
            >
              {importing ? '匯入中…' : `匯入 ${selected.size} 個`}
            </button>
          </div>
        )}
      </section>
      <DayRecommendations
        recommendations={buckets ?? EMPTY_BUCKETS}
        dateIso={dateIso}
        onAdd={onAdd}
        onArchive={onArchive}
        onDelete={onDelete}
      />
    </div>
  )
}
