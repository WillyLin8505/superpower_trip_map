'use client'
import { useDroppable } from '@dnd-kit/core'
import { ItineraryCard } from './ItineraryCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import type { DayItinerary, TransportMode, PlaceType } from '@/lib/types'

interface Props {
  day: DayItinerary
  dayIdx: number
  mode: TransportMode
  isDragging?: boolean
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
}

export function ItineraryDay({ day, dayIdx, mode, isDragging, draggable, onTimeChange, onToggleLock, onChangeType }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIdx}` })

  return (
    <section className="mb-12" data-testid={`day-${dayIdx}`}>
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
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
              draggable={draggable}
              onTimeChange={onTimeChange}
              onToggleLock={onToggleLock}
              onChangeType={onChangeType}
            />
          ))}
        </div>
        {embedUrl && (
          <div className="w-96 shrink-0 sticky top-4 rounded-xl overflow-hidden border border-gray-200">
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
      </div>
    </section>
  )
}
