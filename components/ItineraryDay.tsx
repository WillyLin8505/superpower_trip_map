import { ItineraryCard } from './ItineraryCard'
import type { DayItinerary } from '@/lib/types'

interface Props {
  day: DayItinerary
  draggable?: boolean
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
}

export function ItineraryDay({ day, draggable, onTimeChange }: Props) {
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
    </section>
  )
}
