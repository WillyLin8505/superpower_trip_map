'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import { getTodayHours } from '@/lib/utils/hours'
import type { PlaceType, ScheduledPlace } from '@/lib/types'

const TYPE_STYLE: Record<PlaceType, { bg: string; text: string; label: string }> = {
  attraction: { bg: 'bg-blue-100', text: 'text-blue-700', label: '景點' },
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700', label: '餐廳' },
  dessert:    { bg: 'bg-pink-100',  text: 'text-pink-700',  label: '甜點' },
}

interface Props {
  place: ScheduledPlace
  index: number
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleLock?: (placeId: string) => void
}

export function ItineraryCard({ place, index, draggable, onTimeChange, onToggleLock }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const todayHours = getTodayHours(place.openingHours)
  const descriptionText = place.description || place.aiDescription
  const typeStyle = TYPE_STYLE[place.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-xl p-4 ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
      data-testid={`card-${place.id}`}
    >
      <div className="flex items-start gap-3">
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
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeStyle.bg} ${typeStyle.text}`}>
              {typeStyle.label}
            </span>
            {place.outsideHours && (
              <span className="text-xs text-orange-600 font-medium">&#x26A0; 請確認營業時間</span>
            )}
          </div>
          <div className="flex gap-4 mt-1 flex-wrap">
            {place.timeLocked ? (
              <p className="text-sm text-gray-500">
                {place.startTime} · 停留 {place.durationMin} 分鐘
              </p>
            ) : onTimeChange ? (
              <>
                <TimeEditor
                  value={place.startTime}
                  label="開始"
                  onChange={(v) => onTimeChange(place.id, 'startTime', v)}
                />
                <TimeEditor
                  value={`${Math.floor(place.durationMin / 60).toString().padStart(2, '0')}:${(place.durationMin % 60).toString().padStart(2, '0')}`}
                  label="停留"
                  onChange={(v) => {
                    const [h, m] = v.split(':').map(Number)
                    onTimeChange(place.id, 'durationMin', h * 60 + m)
                  }}
                />
              </>
            ) : (
              <p className="text-sm text-gray-500">{place.startTime} · 停留 {place.durationMin} 分鐘</p>
            )}
          </div>
          {todayHours && (
            <p className="text-sm text-gray-500 mt-0.5">今日 {todayHours}</p>
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
        </div>
        {onToggleLock && (
          <button
            onClick={() => onToggleLock(place.id)}
            className="text-xl leading-none mt-0.5 opacity-50 hover:opacity-100 transition-opacity shrink-0"
            aria-label={place.timeLocked ? '解鎖時間' : '鎖定時間'}
          >
            {place.timeLocked ? '🔒' : '🔓'}
          </button>
        )}
      </div>
      {place.travelMinToNext !== null && place.travelMinToNext > 0 && (
        <p className="text-xs text-gray-400 mt-3 pl-10">&#x2192; 前往下一站約 {place.travelMinToNext} 分鐘</p>
      )}
    </div>
  )
}
