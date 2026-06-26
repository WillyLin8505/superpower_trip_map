import { ItineraryCard } from './ItineraryCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import type { DayItinerary, TransportMode } from '@/lib/types'

interface Props {
  day: DayItinerary
  mode: TransportMode
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryDay({ day, mode, draggable, onTimeChange }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)

  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {day.aiSummary && <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>}
      <div className="space-y-3">
        {day.places.map((place, i) => (
          <ItineraryCard
            key={place.id}
            place={place}
            index={i}
            draggable={draggable}
            onTimeChange={onTimeChange}
          />
        ))}
      </div>
      {embedUrl && (
        <div className="mt-4 rounded-xl overflow-hidden border border-gray-200">
          <iframe
            src={embedUrl}
            width="100%"
            height="400"
            style={{ border: 0 }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            title={`第 ${day.day} 天路線地圖`}
          />
        </div>
      )}
    </section>
  )
}
