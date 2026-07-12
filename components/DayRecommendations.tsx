'use client'
import { useState } from 'react'
import type { CategoryBuckets, DayRecommendation, RecommendationCenter } from '@/lib/types'
import { RecommendationCard } from './RecommendationCard'
import { RecommendationCenterPicker } from './RecommendationCenterPicker'
import { REC_CATEGORIES } from '@/lib/utils/dayRecommend'
import { TYPE_META } from '@/lib/placeType'

type Category = (typeof REC_CATEGORIES)[number]

interface Props {
  recommendations?: CategoryBuckets   // undefined = still loading (DEC-301 always-visible)
  dateIso: string
  onAdd: (rec: DayRecommendation) => void
  backfilling?: Partial<Record<Category, boolean>>
  hasCenter?: boolean                 // false = resolveDayCenter found nothing usable
  center?: RecommendationCenter | null
  onSetCenter?: (center: RecommendationCenter) => void
  onClearCenter?: () => void
  onRefreshCategory?: (category: Category) => void
  refreshing?: Partial<Record<Category, boolean>>
  error?: string | null
  onArchive?: (rec: DayRecommendation) => void
}

export function DayRecommendations({
  recommendations, dateIso, onAdd, backfilling, hasCenter, center, onSetCenter, onClearCenter,
  onRefreshCategory, refreshing, error, onArchive,
}: Props) {
  const [tab, setTab] = useState<Category>(REC_CATEGORIES[0])

  const loading = recommendations === undefined
  const list = recommendations?.[tab]?.shown ?? []
  const isBackfilling = !!backfilling?.[tab]
  const isRefreshing = !!refreshing?.[tab]

  return (
    <div className="mt-3 border-t border-gray-200 pt-3" data-testid="day-recommendations">
      <p className="text-xs font-semibold text-gray-600 mb-2">推薦給這一天</p>

      {onSetCenter && (
        <div className="mb-2" data-testid="rec-center-control">
          {center ? (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <span>📍 {center.name}</span>
              {onClearCenter && (
                <button type="button" onClick={onClearCenter} data-testid="rec-center-clear" className="underline">
                  清除
                </button>
              )}
            </div>
          ) : (
            <RecommendationCenterPicker onSelect={onSetCenter} />
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 mb-2" role="alert">{error}</p>
      )}

      {!error && loading && (
        <p className="text-xs text-gray-400" data-testid="rec-loading">載入推薦中…</p>
      )}

      {!error && !loading && hasCenter === false && (
        <p className="text-xs text-amber-600 mb-2" data-testid="rec-missing-center">選擇這一天的推薦中心</p>
      )}

      {!error && !loading && (
        <>
          <div className="flex gap-1 mb-2">
            {REC_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTab(c)}
                data-testid={`rec-tab-${c}`}
                className={`text-xs px-2 py-1 rounded-full border ${
                  tab === c ? 'border-clay bg-clay-tint text-clay-deep' : 'border-gray-200 text-gray-500'
                }`}
              >
                {TYPE_META[c].emoji} {TYPE_META[c].label} {recommendations?.[c]?.shown.length ?? 0}
              </button>
            ))}
            {onRefreshCategory && (
              <button
                type="button"
                onClick={() => onRefreshCategory(tab)}
                disabled={isRefreshing}
                data-testid="rec-refresh"
                className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-500 disabled:opacity-40"
              >
                {isRefreshing ? '換一批中…' : '換一批'}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {list.length === 0 && !isBackfilling ? (
              <p className="text-xs text-gray-400">這個類別暫無推薦</p>
            ) : (
              <>
                {list.map((rec) => (
                  <RecommendationCard key={rec.placeId} rec={rec} dateIso={dateIso} onAdd={() => onAdd(rec)} onArchive={onArchive} />
                ))}
                {isBackfilling && (
                  <div data-testid="rec-backfilling" className="border border-dashed border-gray-200 rounded-xl p-3 text-xs text-gray-400">
                    載入中…
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
