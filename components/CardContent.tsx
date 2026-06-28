'use client'
import { TimeScrollPicker } from './TimeScrollPicker'
import { TypePicker } from './TypePicker'
import { getHoursForDate } from '@/lib/utils/hours'
import { addMinutes } from '@/lib/utils/time'
import type { PlaceType, ScheduledPlace } from '@/lib/types'
import { TYPE_META } from '@/lib/placeType'

interface Props {
  place: ScheduledPlace
  dateIso: string
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
}

export function CardContent({ place, dateIso, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType }: Props) {
  const todayHours = getHoursForDate(place.openingHours, dateIso)
  const descriptionText = place.description || place.aiDescription
  const meta = TYPE_META[place.type]

  return (
    <>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900">{place.name}</h3>
          {onChangeType ? (
            <TypePicker type={place.type} onChange={(t) => onChangeType(place.id, t)} />
          ) : (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.badge}`}>{meta.label}</span>
          )}
          {place.outsideHours && (
            <span className="text-xs text-orange-600 font-medium">&#x26A0; 請確認營業時間</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {place.startLocked || !onTimeChange ? (
            <span className="text-sm text-gray-500">{place.startTime}</span>
          ) : (
            <TimeScrollPicker value={place.startTime} onChange={(v) => onTimeChange(place.id, 'startTime', v)} />
          )}
          <span className="text-gray-400 text-sm">&#x2192;</span>
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
        {todayHours && <p className="text-sm text-gray-500 mt-0.5">營業 {todayHours}</p>}
        {place.rating && <p className="text-sm text-gray-500 mt-0.5">評分：{place.rating} &#x2605;</p>}
        {descriptionText && <p className="text-sm text-gray-600 mt-2 italic">{descriptionText}</p>}
        {place.lateExit && <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 結束時間超出營業時間</p>}
      </div>
      {(onToggleStartLock || onToggleDurationLock) && (
        <div className="flex flex-col gap-1 shrink-0 mt-0.5">
          {onToggleStartLock && (
            <button
              type="button"
              onClick={() => onToggleStartLock(place.id)}
              className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
              aria-label={place.startLocked ? '解鎖開始時間' : '鎖定開始時間'}
            >
              {place.startLocked ? '🔒' : '🔓'} 開始
            </button>
          )}
          {onToggleDurationLock && (
            <button
              type="button"
              onClick={() => onToggleDurationLock(place.id)}
              className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
              aria-label={place.durationLocked ? '解鎖停留時間' : '鎖定停留時間'}
            >
              {place.durationLocked ? '🔒' : '🔓'} 停留
            </button>
          )}
        </div>
      )}
    </>
  )
}
