'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { TypePicker } from './TypePicker'
import { TimeScrollPicker } from './TimeScrollPicker'
import type { PlaceType, ScheduledPlace, TransportMode } from '@/lib/types'
import { DWELL, TYPE_META } from '@/lib/placeType'
import { getHoursForDate } from '@/lib/utils/hours'
import { effectivePinned } from '@/lib/utils/lockDerive'
import { addMinutes } from '@/lib/utils/time'

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
}

const LEG_META: Record<TransportMode, { icon: string; label: string }> = {
  driving: { icon: '🚗', label: '開車' },
  walking: { icon: '🚶', label: '步行' },
  transit: { icon: '🚇', label: '大眾運輸' },
}

export function ItineraryCard({
  place,
  index,
  dateIso,
  draggable,
  onTimeChange,
  onToggleStartLock,
  onToggleDurationLock,
  onToggleEndLock,
  onChangeType,
  onChangeLegMode,
  legBusy,
}: Props) {
  const pinned = effectivePinned(place)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable || pinned.start })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const todayHours = getHoursForDate(place.openingHours, dateIso)
  const descriptionText = place.description || place.aiDescription
  const meta = TYPE_META[place.type]
  const displayName = resolvePlaceName(place)
  const endTime = addMinutes(place.startTime, place.durationMin)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border rounded-xl p-4 ${meta.cardBg} ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
      data-testid={`card-${place.id}`}
    >
      <div className="flex items-start gap-3">
        {draggable && !pinned.start && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-1 select-none"
            data-testid="drag-handle"
          >
            &#x2807;
          </span>
        )}
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{displayName.primary}</h3>
            {onChangeType ? (
              <TypePicker type={place.type} onChange={(type) => onChangeType(place.id, type)} />
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
          {displayName.secondary && (
            <p className="text-sm text-gray-500 mt-0.5">{displayName.secondary}</p>
          )}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {pinned.start || !onTimeChange ? (
              <span className="text-sm text-gray-500">{place.startTime}</span>
            ) : (
              <TimeScrollPicker
                value={place.startTime}
                onChange={(value) => onTimeChange(place.id, 'startTime', value)}
              />
            )}
            <span className="text-gray-400 text-sm">→</span>
            {pinned.duration || pinned.end || !onTimeChange ? (
              <span className="text-sm text-gray-500">{endTime}</span>
            ) : (
              <TimeScrollPicker
                value={endTime}
                onChange={(value) => {
                  const [endHour, endMinute] = value.split(':').map(Number)
                  const [startHour, startMinute] = place.startTime.split(':').map(Number)
                  const rawDuration = endHour * 60 + endMinute - (startHour * 60 + startMinute)
                  const duration = rawDuration > 0 ? rawDuration : rawDuration + 1440
                  if (duration > 0) onTimeChange(place.id, 'durationMin', duration)
                }}
              />
            )}
          </div>
          {todayHours && <p className="text-sm text-gray-500 mt-0.5">營業 {todayHours}</p>}
          {place.rating && <p className="text-sm text-gray-500 mt-0.5">評分：{place.rating} &#x2605;</p>}
          {descriptionText && <p className="text-sm text-gray-600 mt-2 italic">{descriptionText}</p>}
          {place.lateExit && (
            <p className="text-xs text-orange-600 font-medium mt-1">&#x26A0; 結束時間超出營業時間</p>
          )}
          {place.durationMin < DWELL[place.type] && (
            <p className="text-xs text-orange-600 font-medium mt-1">
              &#x26A0; 停留少於建議：{DWELL[place.type]} 分鐘
            </p>
          )}
        </div>
        {(onToggleStartLock || onToggleDurationLock || onToggleEndLock) && (
          <div className="flex flex-col gap-1 shrink-0 mt-0.5">
            {onToggleStartLock && (
              <LockButton
                label="開始時間"
                locked={pinned.start}
                derived={pinned.start && !place.startLocked}
                onClick={() => onToggleStartLock(place.id)}
              />
            )}
            {onToggleDurationLock && (
              <LockButton
                label="停留時間"
                locked={pinned.duration}
                derived={pinned.duration && !place.durationLocked}
                onClick={() => onToggleDurationLock(place.id)}
              />
            )}
            {onToggleEndLock && (
              <LockButton
                label="結束時間"
                locked={pinned.end}
                derived={pinned.end && !(place.endLocked ?? false)}
                onClick={() => onToggleEndLock(place.id)}
              />
            )}
          </div>
        )}
      </div>
      {place.travelMinToNext !== null && (
        <div className="text-xs text-gray-400 mt-3 pl-10 flex items-center gap-2 flex-wrap">
          <span>
            &#x2192; {LEG_META[place.legMode ?? 'driving'].icon} {LEG_META[place.legMode ?? 'driving'].label}{' '}
            {place.travelMinToNext} 分
          </span>
          {onChangeLegMode && (
            legBusy ? (
              <span className="text-gray-400">計算中…</span>
            ) : (
              <select
                aria-label="交通工具"
                value={place.legMode ?? 'driving'}
                onChange={(event) => onChangeLegMode(place.id, event.target.value as TransportMode)}
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

function resolvePlaceName(place: ScheduledPlace): { primary: string; secondary: string | null } {
  const localized = (place as ScheduledPlace & {
    localizedName?: { zhTw?: string | null; en?: string | null; original?: string | null } | null
  }).localizedName
  const primary = localized?.zhTw || localized?.original || localized?.en || place.name
  const secondary = [localized?.original, localized?.en, place.name].find((name) => name && name !== primary) ?? null

  return { primary, secondary }
}

function LockButton({
  label,
  locked,
  derived,
  onClick,
}: {
  label: string
  locked: boolean
  derived: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={derived}
      title={derived ? '已由另外兩個時間鎖定' : undefined}
      className="text-xs leading-none opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
      aria-label={`${locked ? '解鎖' : '鎖定'}${label}`}
    >
      {locked ? '🔒' : '🔓'} {label.replace('時間', '')}
    </button>
  )
}
