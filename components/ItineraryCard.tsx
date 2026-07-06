'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeScrollPicker } from './TimeScrollPicker'
import { TypePicker } from './TypePicker'
import { getHoursForDate } from '@/lib/utils/hours'
import { addMinutes } from '@/lib/utils/time'
import type { PlaceType, ScheduledPlace, TransportMode } from '@/lib/types'
import { SUGGESTED_DURATION, TYPE_META } from '@/lib/placeType'
import { effectivePinned, isDerived } from '@/lib/utils/lockDerive'

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
  dayEnd?: string
}

export function ItineraryCard({ place, index, dateIso, draggable, onTimeChange, onToggleStartLock, onToggleDurationLock, onToggleEndLock, onChangeType, onChangeLegMode, legBusy, onDeletePlace, dayEnd }: Props) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-xl p-4 ${meta.cardBg} ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
      data-testid={`card-${place.id}`}
    >
      <div className="flex items-start gap-3">
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
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{place.name}</h3>
            {onChangeType ? (
              <TypePicker type={place.type} onChange={(t) => onChangeType(place.id, t)} />
            ) : (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>
                {meta.label}
              </span>
            )}
            {place.nightIndex && <span className="text-xs text-purple-700">第 {place.nightIndex} 晚</span>}
            {place.outsideHours && (
              <span className="text-xs text-orange-600 font-medium">&#x26A0; 請確認營業時間</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {place.startLocked || !onTimeChange ? (
              <span className="text-sm text-gray-500">{place.startTime}</span>
            ) : (
              <TimeScrollPicker
                value={place.startTime}
                onChange={(v) => onTimeChange(place.id, 'startTime', v)}
              />
            )}
            <span className="text-gray-400 text-sm">→</span>
            {place.durationLocked || !onTimeChange ? (
              <span className="text-sm text-gray-500">{addMinutes(place.startTime, place.durationMin)}</span>
            ) : (
              <TimeScrollPicker
                value={addMinutes(place.startTime, place.durationMin)}
                onChange={(v) => {
                  const [eh, em] = v.split(':').map(Number)
                  const [sh, sm] = place.startTime.split(':').map(Number)
                  const rawDur = (eh * 60 + em) - (sh * 60 + sm)
                  const dur = rawDur > 0 ? rawDur : rawDur + 1440
                  if (dur > 0) onTimeChange(place.id, 'durationMin', dur)
                }}
              />
            )}
          </div>
          {todayHours && (
            <p className="text-sm text-gray-500 mt-0.5">營業 {todayHours}</p>
          )}
          {place.rating && (
            <p className="text-sm text-gray-500 mt-0.5">評分：{place.rating} &#x2605;</p>
          )}
          {descriptionText && (
            <p className="text-sm text-gray-600 mt-2 italic">{descriptionText}</p>
          )}
          {place.lateExit && (
            <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 結束時間超出營業時間</p>
          )}
          {(() => {
            const suggested = SUGGESTED_DURATION[place.type]
            if (suggested === undefined) return null
            if (place.durationMin < suggested) return (
              <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 停留少於建議（建議 {suggested} 分）</p>
            )
            if (place.durationMin > suggested) return (
              <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 停留超過建議（建議 {suggested} 分）</p>
            )
            return null
          })()}
          {dayEnd && toMin(place.startTime) + place.durationMin > toMin(dayEnd) && (
            <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 超出當天活動時間（活動至 {dayEnd}）</p>
          )}
          {place.type === 'accommodation' && toMin(place.startTime) < 15 * 60 && (
            <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 早於一般 check-in 時間（15:00）</p>
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
        <div className="text-xs text-gray-400 mt-3 pl-10 flex items-center gap-2 flex-wrap">
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
