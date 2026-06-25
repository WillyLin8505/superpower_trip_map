import { ItineraryCard } from './ItineraryCard'
import type { DayItinerary } from '@/lib/types'

interface Props {
  day: DayItinerary
}

export function ItineraryDay({ day }: Props) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-bold text-gray-800 mb-1">第 {day.day} 天</h2>
      {day.aiSummary && (
        <p className="text-sm text-gray-500 mb-4">{day.aiSummary}</p>
      )}
      <div className="space-y-3">
        {day.places.map((place, i) => (
          <ItineraryCard key={place.id} place={place} index={i} />
        ))}
      </div>
    </section>
  )
}
