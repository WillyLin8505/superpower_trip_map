'use client'
import type { DayRecommendation } from '@/lib/types'
import { getHoursForDate } from '@/lib/utils/hours'
import { TYPE_META } from '@/lib/placeType'
import { PhotoStrip } from './PhotoStrip'

interface Props {
  rec: DayRecommendation
  dateIso: string
  onAdd: () => void
  onArchive?: (rec: DayRecommendation) => void
}

export function RecommendationCard({ rec, dateIso, onAdd, onArchive }: Props) {
  const meta = TYPE_META[rec.type]
  const todayHours = getHoursForDate(rec.openingHours, dateIso)
  const photos = rec.photoUrls?.length ? rec.photoUrls : rec.photoUrl ? [rec.photoUrl] : []

  return (
    <div className={`border border-border rounded-xl p-3 ${meta.cardBg}`} data-testid={`rec-${rec.placeId}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onAdd}
          aria-label={`加入 ${rec.name}`}
          data-testid={`rec-add-${rec.placeId}`}
          className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-clay text-white text-sm flex items-center justify-center hover:bg-clay-deep"
        >
          &#x2190;
        </button>
        {onArchive && (
          <button
            type="button"
            onClick={() => onArchive(rec)}
            aria-label="移到備用"
            className="shrink-0 mt-0.5 text-gray-300 hover:text-clay-deep transition-colors leading-none"
          >
            &#x1F4E5;
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-gray-900 text-sm">{rec.name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
          </div>
          {todayHours && <p className="text-xs text-gray-500 mt-0.5">營業 {todayHours}</p>}
          {rec.rating && <p className="text-xs text-gray-500 mt-0.5">評分：{rec.rating} &#x2605;</p>}
          <PhotoStrip photos={photos} placeId={rec.placeId} placeName={rec.name} className="mt-2" />
          {rec.description && <p className="text-xs text-gray-600 mt-1 italic">{rec.description}</p>}
          <p className="text-xs text-gray-600 mt-1">{rec.reason}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">來源：{rec.sourceLabel}</p>
        </div>
      </div>
    </div>
  )
}
