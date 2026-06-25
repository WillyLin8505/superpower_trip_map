'use client'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TimeEditor } from './TimeEditor'
import type { ScheduledPlace } from '@/lib/types'

interface Props {
  place: ScheduledPlace
  index: number
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryCard({ place, index, draggable, onTimeChange }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: place.id, disabled: !draggable })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-xl p-4 ${place.outsideHours ? 'border-orange-300' : 'border-gray-200'}`}
    >
      <div className="flex items-start gap-3">
        {draggable && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-gray-300 hover:text-gray-500 mt-1 select-none"
          >&#x2807;</span>
        )}
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{place.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              place.type === 'attraction' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {place.type === 'attraction' ? '景點' : '餐廳'}
            </span>
            {place.outsideHours && (
              <span className="text-xs text-orange-600 font-medium">&#x26A0; 請確認營業時間</span>
            )}
          </div>
          <div className="flex gap-4 mt-1 flex-wrap">
            {onTimeChange ? (
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
          {place.rating && <p className="text-sm text-gray-500 mt-0.5">評分：{place.rating} &#x2605;</p>}
          {place.ticketPrice && <p className="text-sm text-gray-500">票價：{place.ticketPrice}</p>}
          {place.aiDescription && <p className="text-sm text-gray-600 mt-2 italic">{place.aiDescription}</p>}
        </div>
      </div>
      {place.travelMinToNext !== null && (
        <p className="text-xs text-gray-400 mt-3 pl-10">&#x2192; 前往下一站約 {place.travelMinToNext} 分鐘</p>
      )}
    </div>
  )
}
