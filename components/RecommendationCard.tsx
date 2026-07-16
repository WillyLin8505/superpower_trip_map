'use client'
import type { DayRecommendation } from '@/lib/types'
import { getHoursForDate } from '@/lib/utils/hours'
import { resolveLocalizedText } from '@/lib/utils/localizedPlace'
import { googleMapsSearchUrl } from '@/lib/utils/googleMapsUrl'
import { TYPE_META } from '@/lib/placeType'
import { PhotoStrip } from './PhotoStrip'

const ARCHIVE_LABEL = '移到備用'
const ARCHIVE_ICON = '💾'
const GENERIC_REASONS = new Set(['Google 高評分推薦'])

interface Props {
  rec: DayRecommendation
  dateIso: string
  onAdd?: () => void
  onArchive?: (rec: DayRecommendation) => void
  actionTestIds?: {
    add?: string
    archive?: string
  }
  compact?: boolean
}

function compactExplanation(rec: DayRecommendation): string | null {
  if (rec.description?.trim()) return rec.description.trim()
  const reason = rec.reason?.trim()
  if (reason && !GENERIC_REASONS.has(reason)) return reason
  return null
}

export function RecommendationCard({ rec, dateIso, onAdd, onArchive, actionTestIds, compact = false }: Props) {
  const meta = TYPE_META[rec.type]
  const todayHours = getHoursForDate(rec.openingHours, dateIso)
  const photos = rec.photoUrls?.length ? rec.photoUrls : rec.photoUrl ? [rec.photoUrl] : []
  const displayName = resolveLocalizedText(rec.localizedName, rec.name)
  const mapsUrl = googleMapsSearchUrl(rec, displayName.primary)
  const shortExplanation = compactExplanation(rec)

  return (
    <div className={`border border-border rounded-xl p-3 ${meta.cardBg}`} data-testid={`rec-${rec.placeId}`}>
      <div className="flex items-start gap-2">
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`加入 ${displayName.primary}`}
            data-testid={actionTestIds?.add ?? `rec-add-${rec.placeId}`}
            className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-clay text-white text-sm flex items-center justify-center hover:bg-clay-deep"
          >
            &#x2190;
          </button>
        )}
        {onArchive && (
          <button
            type="button"
            onClick={() => onArchive(rec)}
            aria-label={ARCHIVE_LABEL}
            title={ARCHIVE_LABEL}
            data-testid={actionTestIds?.archive}
            className="shrink-0 mt-0.5 w-8 h-8 rounded-full bg-clay text-white text-base flex items-center justify-center hover:bg-clay-deep transition-colors shadow-sm"
          >
            <span aria-hidden="true" className="leading-none">{ARCHIVE_ICON}</span>
            <span className="sr-only">{ARCHIVE_LABEL}</span>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-gray-900 text-sm min-w-0 max-w-full">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-clay-deep break-words [overflow-wrap:anywhere]">
                {displayName.primary}
              </a>
            </h4>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
          </div>
          {!compact && displayName.secondary && <p className="text-xs text-gray-500 mt-0.5">{displayName.secondary}</p>}
          {!compact && todayHours && <p className="text-xs text-gray-500 mt-0.5">營業 {todayHours}</p>}
          {!compact && rec.rating && <p className="text-xs text-gray-500 mt-0.5">評分：{rec.rating} ★</p>}
          <PhotoStrip photos={photos} placeId={rec.placeId} placeName={displayName.primary} className="mt-2" />
          {compact && shortExplanation && <p className="text-xs text-gray-600 mt-1">{shortExplanation}</p>}
          {!compact && rec.description && <p className="text-xs text-gray-600 mt-1 italic">{rec.description}</p>}
          {!compact && <p className="text-xs text-gray-600 mt-1">{rec.reason}</p>}
          {!compact && <p className="text-[11px] text-gray-400 mt-0.5">來源：{rec.sourceLabel}</p>}
        </div>
      </div>
    </div>
  )
}
