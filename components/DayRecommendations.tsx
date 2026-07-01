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
}

export function DayRecommendations({ recommendations, dateIso, onAdd }: Props) {
  const [tab, setTab] = useState<(typeof REC_CATEGORIES)[number]>(REC_CATEGORIES[0])

  const total = REC_CATEGORIES.reduce((n, c) => n + recommendations[c].length, 0)
  if (total === 0) return null

  const list = recommendations[tab]

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
              tab === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'
            }`}
          >
            {TYPE_META[c].emoji} {TYPE_META[c].label} {recommendations[c].length}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {list.length === 0 ? (
          <p className="text-xs text-gray-400">這個類別暫無推薦</p>
        ) : (
          list.map((rec) => (
            <RecommendationCard key={rec.placeId} rec={rec} dateIso={dateIso} onAdd={() => onAdd(rec)} />
          ))
        )}
      </div>
    </div>
  )
}
