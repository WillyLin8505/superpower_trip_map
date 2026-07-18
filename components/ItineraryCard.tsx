'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeScrollPicker } from './TimeScrollPicker'
import { TypePicker } from './TypePicker'
import { PhotoStrip } from './PhotoStrip'
import { getHoursForDate } from '@/lib/utils/hours'
import { addMinutes } from '@/lib/utils/time'
import { resolveLocalizedText } from '@/lib/utils/localizedPlace'
import { googleMapsSearchUrl } from '@/lib/utils/googleMapsUrl'
import type { PlaceType, ScheduledPlace, TransportMode } from '@/lib/types'
import { SUGGESTED_DURATION, TYPE_META } from '@/lib/placeType'
import { effectivePinned, isDerived } from '@/lib/utils/lockDerive'

const ARCHIVE_LABEL = '\u79fb\u5230\u5099\u7528'
const ARCHIVE_ICON = '\uD83D\uDCBE'

function uniqueText(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))))
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

interface Props {
  place: ScheduledPlace
  index: number
  dateIso: string
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onToggleEndLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
  onChangeLegMode?: (placeId: string, mode: TransportMode) => void
  legBusy?: boolean
  onDeletePlace?: (placeId: string) => void
  onArchive?: (place: ScheduledPlace) => void
  dayEnd?: string
  compact?: boolean
}

export function ItineraryCard({ place, index, dateIso, draggable, onTimeChange, onToggleStartLock, onToggleDurationLock, onToggleEndLock, onChangeType, onChangeLegMode, legBusy, onDeletePlace, onArchive, dayEnd, compact = false }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const LEG_META: Record<TransportMode, { icon: string; label: string }> = {
    driving: { icon: '🚗', label: '開車' },
    walking: { icon: '🚶', label: '步行' },
    transit: { icon: '🚇', label: '大眾運輸' },
  }

  const todayHours = getHoursForDate(place.openingHours, dateIso)
  const descriptionText = place.description || place.aiDescription
  const meta = TYPE_META[place.type]
  const pin = effectivePinned(place)
  const displayName = resolveLocalizedText(place.localizedName, place.name)
  const mapsUrl = googleMapsSearchUrl(place, displayName.primary)
  const endTime = addMinutes(place.startTime, place.durationMin)
  const photos = place.photoUrls?.length ? place.photoUrls : place.photoUrl ? [place.photoUrl] : []
  const photoAliases = uniqueText([
    displayName.secondary,
    place.localizedName?.original,
    place.localizedName?.en,
  ])
  const isCompact = compact || isDragging

  if (isCompact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`border border-l-4 rounded-xl p-3 ${meta.cardBg} ${meta.accent} ${place.outsideHours ? 'border-warn' : 'border-border'}`}
        data-testid={`card-${place.id}`}
      >
        <div className="flex items-center gap-3">
          <span className="w-7 h-7 rounded-full bg-clay text-white text-sm font-bold flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h3 className="font-semibold text-ink min-w-0 truncate">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-clay-deep">
                {displayName.primary}
              </a>
            </h3>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-l-4 rounded-xl p-4 ${meta.cardBg} ${meta.accent} ${place.outsideHours ? 'border-warn' : 'border-border'}`}
      data-testid={`card-${place.id}`}
    >
      <div className="flex items-start gap-3">
        {onArchive && (
          <button
            type="button"
            onClick={() => onArchive(place)}
            aria-label={ARCHIVE_LABEL}
            title={ARCHIVE_LABEL}
            className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-clay text-white text-base flex items-center justify-center hover:bg-clay-deep transition-colors shadow-sm"
          >
            <span aria-hidden="true" className="leading-none">{ARCHIVE_ICON}</span>
            <span className="sr-only">{ARCHIVE_LABEL}</span>
          </button>
        )}
        {onDeletePlace && (
          <button
            type="button"
            onClick={() => onDeletePlace(place.id)}
            aria-label="刪除地點"
            className="text-gray-300 hover:text-red-500 transition-colors mt-1 shrink-0 leading-none"
          >&#x2715;</button>
        )}
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-1 select-none"
            data-testid="drag-handle"
          >&#x2807;</span>
        )}
        <span className="w-7 h-7 rounded-full bg-clay text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-ink">
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-clay-deep">
                {displayName.primary}
              </a>
            </h3>
            {onChangeType ? (
              <TypePicker type={place.type} onChange={(t) => onChangeType(place.id, t)} />
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
                {meta.label}
              </span>
            )}
            {place.nightIndex && <span className="text-xs text-lodging-ink">第 {place.nightIndex} 晚</span>}
            {place.outsideHours && (
              <span className="text-xs text-warn font-medium">&#x26A0; 請確認營業時間</span>
            )}
          </div>
          {displayName.secondary && (
            <p className="text-sm text-gray-500 mt-0.5">{displayName.secondary}</p>
          )}
          <div className="grid grid-cols-3 gap-2 mt-2 max-w-md">
            <TimeFacet label="開始">
              {pin.start || !onTimeChange ? (
                <span className="text-sm text-clay-deep tabular-nums">{place.startTime}</span>
              ) : (
                <TimeScrollPicker
                  value={place.startTime}
                  onChange={(v) => onTimeChange(place.id, 'startTime', v)}
                />
              )}
            </TimeFacet>
            <TimeFacet label="停留">
              {pin.duration || !onTimeChange ? (
                <span className="text-sm text-clay-deep tabular-nums">{place.durationMin} 分</span>
              ) : (
                <label className="inline-flex items-center gap-1">
                  <input
                    aria-label="停留分鐘"
                    type="number"
                    min={5}
                    step={5}
                    value={place.durationMin}
                    onChange={(event) => {
                      const duration = Number(event.target.value)
                      if (Number.isFinite(duration) && duration > 0) {
                        onTimeChange(place.id, 'durationMin', duration)
                      }
                    }}
                    className="w-16 rounded border border-border bg-surface px-1 py-0.5 text-sm text-clay-deep tabular-nums"
                  />
                  <span className="text-xs text-muted">分</span>
                </label>
              )}
            </TimeFacet>
            <TimeFacet label="結束">
              {pin.end || pin.duration || !onTimeChange ? (
                <span className="text-sm text-clay-deep tabular-nums">{endTime}</span>
              ) : (
                <TimeScrollPicker
                  value={endTime}
                  onChange={(v) => {
                    const [eh, em] = v.split(':').map(Number)
                    const [sh, sm] = place.startTime.split(':').map(Number)
                    const rawDur = (eh * 60 + em) - (sh * 60 + sm)
                    const dur = rawDur > 0 ? rawDur : rawDur + 1440
                    if (dur > 0) onTimeChange(place.id, 'durationMin', dur)
                  }}
                />
              )}
            </TimeFacet>
          </div>
          {todayHours && (
            <p className="text-sm text-muted mt-0.5">營業 {todayHours}</p>
          )}
          {place.rating && (
            <p className="text-sm text-muted mt-0.5">評分：{place.rating} &#x2605;</p>
          )}
          <PhotoStrip photos={photos} placeId={place.placeId} placeName={displayName.primary} className="mt-2" placeType={place.type} aliases={photoAliases} />
          {descriptionText && (
            <p className="text-sm text-gray-600 mt-2 italic">{descriptionText}</p>
          )}
          {place.lateExit && (
            <p className="text-xs text-warn font-medium mt-1">&#x26A0; 結束時間超出營業時間</p>
          )}
          {(() => {
            const suggested = SUGGESTED_DURATION[place.type]
            if (suggested === undefined) return null
            if (place.durationMin < suggested) return (
              <p className="text-xs text-warn font-medium mt-1">&#x26A0; 停留少於建議（建議 {suggested} 分）</p>
            )
            if (place.durationMin > suggested) return (
              <p className="text-xs text-warn font-medium mt-1">&#x26A0; 停留超過建議（建議 {suggested} 分）</p>
            )
            return null
          })()}
          {dayEnd && toMin(place.startTime) + place.durationMin > toMin(dayEnd) && (
            <p className="text-xs text-warn font-medium mt-1">&#x26A0; 超出當天活動時間（活動至 {dayEnd}）</p>
          )}
          {place.type === 'accommodation' && toMin(place.startTime) < 15 * 60 && (
            <p className="text-xs text-warn font-medium mt-1">&#x26A0; 早於一般 check-in 時間（15:00）</p>
          )}
        </div>
        {(onToggleStartLock || onToggleDurationLock || onToggleEndLock) && (() => {
          const pin = effectivePinned(place)
          return (
            <div className="flex flex-col gap-1 shrink-0 mt-0.5">
              {onToggleStartLock && (
                <button
                  type="button"
                  onClick={() => onToggleStartLock(place.id)}
                  disabled={isDerived(place, 'start')}
                  className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                  title={isDerived(place, 'start') ? '由另外兩個鎖自動決定' : undefined}
                  aria-label={pin.start ? '解鎖開始時間' : '鎖定開始時間'}
                >
                  {pin.start ? '🔒' : '🔓'} 開始
                </button>
              )}
              {onToggleDurationLock && (
                <button
                  type="button"
                  onClick={() => onToggleDurationLock(place.id)}
                  disabled={isDerived(place, 'duration')}
                  className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                  title={isDerived(place, 'duration') ? '由另外兩個鎖自動決定' : undefined}
                  aria-label={pin.duration ? '解鎖停留時間' : '鎖定停留時間'}
                >
                  {pin.duration ? '🔒' : '🔓'} 停留
                </button>
              )}
              {onToggleEndLock && (
                <button
                  type="button"
                  onClick={() => onToggleEndLock(place.id)}
                  disabled={isDerived(place, 'end')}
                  className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                  title={isDerived(place, 'end') ? '由另外兩個鎖自動決定' : undefined}
                  aria-label={pin.end ? '解鎖結束時間' : '鎖定結束時間'}
                >
                  {pin.end ? '🔒' : '🔓'} 結束
                </button>
              )}
            </div>
          )
        })()}
      </div>
      {place.travelMinToNext !== null && (
        <div className="text-xs text-muted mt-3 pl-10 flex items-center gap-2 flex-wrap">
          <span>
            &#x2192; {LEG_META[place.legMode ?? 'driving'].icon} {LEG_META[place.legMode ?? 'driving'].label} {place.travelMinToNext} 分{place.travelDistanceToNext != null ? ` · ${(place.travelDistanceToNext / 1000).toFixed(1)} 公里` : ''}
          </span>
          {onChangeLegMode && (
            legBusy ? (
              <span className="text-gray-400">計算中…</span>
            ) : (
              <select
                aria-label="交通工具"
                value={place.legMode ?? 'driving'}
                onChange={(e) => onChangeLegMode(place.id, e.target.value as TransportMode)}
                className="border border-gray-200 rounded px-1 py-0.5 text-xs"
              >
                <option value="driving">開車</option>
                <option value="walking">步行</option>
                <option value="transit">大眾運輸</option>
              </select>
            )
          )}
        </div>
      )}
    </div>
  )
}

function TimeFacet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted leading-tight">{label}</div>
      <div className="mt-0.5 min-h-6 flex items-center">{children}</div>
    </div>
  )
}
