'use client'
import { useState } from 'react'
import type { CategoryBuckets, DayRecommendation } from '@/lib/types'
import { RecommendationCard } from './RecommendationCard'
import { REC_CATEGORIES } from '@/lib/utils/dayRecommend'
import { TYPE_META } from '@/lib/placeType'

interface Props {
  recommendations: CategoryBuckets
  dateIso: string
  onAdd: (rec: DayRecommendation) => void
  backfilling?: Partial<Record<(typeof REC_CATEGORIES)[number], boolean>>
}

export function DayRecommendations({ recommendations, dateIso, onAdd, backfilling }: Props) {
  const [tab, setTab] = useState<(typeof REC_CATEGORIES)[number]>(REC_CATEGORIES[0])

  const total = REC_CATEGORIES.reduce((n, c) => n + recommendations[c].shown.length, 0)
  const anyBackfilling = REC_CATEGORIES.some((c) => !!backfilling?.[c])
  if (total === 0 && !anyBackfilling) return null

  const list = recommendations[tab].shown
  const isBackfilling = !!backfilling?.[tab]

  return (
    <div className="mt-3 border-t border-gray-200 pt-3" data-testid="day-recommendations">
      <p className="text-xs font-semibold text-gray-600 mb-2">推薦給這一天</p>
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
            {TYPE_META[c].emoji} {TYPE_META[c].label} {recommendations[c].shown.length}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {list.length === 0 && !isBackfilling ? (
          <p className="text-xs text-gray-400">這個類別暫無推薦</p>
        ) : (
          <>
            {list.map((rec) => (
              <RecommendationCard key={rec.placeId} rec={rec} dateIso={dateIso} onAdd={() => onAdd(rec)} />
            ))}
            {isBackfilling && (
              <div data-testid="rec-backfilling" className="border border-dashed border-gray-200 rounded-xl p-3 text-xs text-gray-400">
                載入中…
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
