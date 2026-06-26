import { haversineSeconds } from '@/lib/haversine'
import type { DayItinerary } from '@/lib/types'

export function findClosestDay(
  days: DayItinerary[],
  place: { lat: number; lng: number }
): number {
  if (days.length === 1) return 0
  const distances = days.map((day) => {
    if (day.places.length === 0) return Infinity
    const centroidLat = day.places.reduce((s, p) => s + p.lat, 0) / day.places.length
    const centroidLng = day.places.reduce((s, p) => s + p.lng, 0) / day.places.length
    return haversineSeconds({ lat: centroidLat, lng: centroidLng }, place)
  })
  return distances.indexOf(Math.min(...distances))
}
