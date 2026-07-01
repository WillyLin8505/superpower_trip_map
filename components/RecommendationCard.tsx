'use client'
import type { DayRecommendation } from '@/lib/types'
import { getHoursForDate } from '@/lib/utils/hours'
import { TYPE_META } from '@/lib/placeType'

interface Props {
  rec: DayRecommendation
  dateIso: string
  onAdd: () => void
}

export function RecommendationCard({ rec, dateIso, onAdd }: Props) {
  const meta = TYPE_META[rec.type]
  const todayHours = getHoursForDate(rec.openingHours, dateIso)

  return (
    <div className={`border border-gray-200 rounded-xl p-3 ${meta.cardBg}`} data-testid={`rec-${rec.placeId}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onAdd}
          aria-label={`加入 ${rec.name}`}
          data-testid={`rec-add-${rec.placeId}`}
          className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center hover:bg-blue-700"
        >
          &#x2190;
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-gray-900 text-sm">{rec.name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
          </div>
          {todayHours && <p className="text-xs text-gray-500 mt-0.5">營業 {todayHours}</p>}
          {rec.rating && <p className="text-xs text-gray-500 mt-0.5">評分：{rec.rating} &#x2605;</p>}
          {rec.description && <p className="text-xs text-gray-600 mt-1 italic">{rec.description}</p>}
          <p className="text-xs text-gray-600 mt-1">{rec.reason}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">來源：{rec.sourceLabel}</p>
        </div>
      </div>
    </div>
  )
}
