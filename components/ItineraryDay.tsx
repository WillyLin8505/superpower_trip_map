'use client'
import { useDroppable } from '@dnd-kit/core'
import { ItineraryCard } from './ItineraryCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import { dayDate, formatDateLabel } from '@/lib/utils/date'
import { DayRecommendations } from './DayRecommendations'
import type { DayItinerary, TransportMode, PlaceType, CategoryBuckets, DayRecommendation } from '@/lib/types'

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

interface Props {
  day: DayItinerary
  dayIdx: number
  mode: TransportMode
  startDate: string
  isDragging?: boolean
  draggable?: boolean
  isOverflow?: boolean
  onScatter?: () => void
  onDelete?: () => void
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
  onSetDayStartLock?: (locked: boolean) => void
  onSetDayDurationLock?: (locked: boolean) => void
  onChangeWindow?: (field: 'dayStart' | 'dayEnd', value: string) => void
  recommendations?: CategoryBuckets
  onAddRecommendation?: (rec: DayRecommendation) => void
}

export function ItineraryDay({ day, dayIdx, mode, startDate, isDragging, draggable, isOverflow, onScatter, onDelete, onTimeChange, onToggleStartLock, onToggleDurationLock, onChangeType, onSetDayStartLock, onSetDayDurationLock, onChangeWindow, recommendations, onAddRecommendation }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIdx}` })

  return (
    <section className="mb-12" data-testid={`day-${dayIdx}`}>
      <h2 className="text-xl font-bold text-gray-800 mb-1">
        第 {day.day} 天 · {isOverflow ? '超出行程' : formatDateLabel(dayDate(startDate, day.day))}
      </h2>
      {isOverflow && (onScatter || onDelete) && (
        <div className="flex gap-2 mb-2">
          {onScatter && (
            <button type="button" onClick={onScatter}
              className="text-xs px-2 py-1 rounded-full border border-orange-300 text-orange-700 hover:bg-orange-50">
              散到其他天
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete}
              className="text-xs px-2 py-1 rounded-full border border-red-300 text-red-600 hover:bg-red-50">
              刪除這天
            </button>
          )}
        </div>
      )}
      {onChangeWindow && (
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
          <span>活動</span>
          <input type="time" value={day.dayStart}
            onChange={(e) => onChangeWindow('dayStart', e.target.value)}
            className="border border-gray-200 rounded px-1 py-0.5" />
          <span>–</span>
          <input type="time" value={day.dayEnd}
            onChange={(e) => onChangeWindow('dayEnd', e.target.value)}
            className="border border-gray-200 rounded px-1 py-0.5" />
          <span>（{((toMin(day.dayEnd) - toMin(day.dayStart)) / 60).toFixed(1)} 小時）</span>
        </div>
      )}
      {(onSetDayStartLock || onSetDayDurationLock) && (() => {
        const has = day.places.length > 0
        const allStart = has && day.places.every((p) => p.startLocked)
        const allDur = has && day.places.every((p) => p.durationLocked)
        return (
          <div className="flex gap-2 mb-2">
            {onSetDayStartLock && (
              <button
                type="button"
                disabled={!has}
                onClick={() => onSetDayStartLock(!allStart)}
                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {allStart ? '🔒' : '🔓'} 整天鎖開始
              </button>
            )}
            {onSetDayDurationLock && (
              <button
                type="button"
                disabled={!has}
                onClick={() => onSetDayDurationLock(!allDur)}
                className="text-xs px-2 py-1 rounded-full border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {allDur ? '🔒' : '🔓'} 整天鎖停留
              </button>
            )}
          </div>
        )
      })()}
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="flex gap-6 items-start">
        <div
          ref={setNodeRef}
          className={`flex-1 space-y-3 rounded-lg transition-colors min-h-[60px] ${isOver ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
        >
          {day.places.map((place, i) => (
            <ItineraryCard
              key={place.id}
              place={place}
              index={i}
              dateIso={dayDate(startDate, day.day)}
              draggable={draggable}
              onTimeChange={onTimeChange}
              onToggleStartLock={onToggleStartLock}
              onToggleDurationLock={onToggleDurationLock}
              onChangeType={onChangeType}
            />
          ))}
        </div>
        {(embedUrl || (recommendations && onAddRecommendation)) && (
          <div className="w-96 shrink-0 sticky top-4">
            {embedUrl && (
              <div className="rounded-xl overflow-hidden border border-gray-200">
                <iframe
                  src={embedUrl}
                  width="100%"
                  height="500"
                  style={{ border: 0, pointerEvents: isDragging ? 'none' : 'auto' }}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`第 ${day.day} 天路線地圖`}
                />
              </div>
            )}
            {recommendations && onAddRecommendation && (
              <DayRecommendations
                recommendations={recommendations}
                dateIso={dayDate(startDate, day.day)}
                onAdd={onAddRecommendation}
              />
            )}
          </div>
        )}
      </div>
    </section>
  )
}
