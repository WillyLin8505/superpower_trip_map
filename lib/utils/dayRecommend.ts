import type { CategoryArrays, CategoryList, DayItinerary, DayRecommendation, RecommendationsByDay } from '@/lib/types'
import { findClosestDay } from './geo'

// DEC-304 fallback order: manual center -> same-day centroid -> previous day
// (manual first, then its centroid) walking backward -> trip centroid -> null.
export function resolveDayCenter(
  days: DayItinerary[],
  dayIdx: number
): { lat: number; lng: number } | null {
  const day = days[dayIdx]
  if (day.recommendationCenter) {
    return { lat: day.recommendationCenter.lat, lng: day.recommendationCenter.lng }
  }
  const sameDay = centroidOf(day.places)
  if (sameDay) return sameDay

  for (let i = dayIdx - 1; i >= 0; i--) {
    const prev = days[i]
    if (prev.recommendationCenter) {
      return { lat: prev.recommendationCenter.lat, lng: prev.recommendationCenter.lng }
    }
    const prevCentroid = centroidOf(prev.places)
    if (prevCentroid) return prevCentroid
  }

  return centroidOf(days.flatMap((d) => d.places))
}

export function dayHasRecommendationAnchor(day: DayItinerary): boolean {
  return Boolean(day.recommendationCenter || day.places.length > 0)
}

export const REC_CATEGORIES = ['dessert', 'attraction', 'restaurant'] as const

// Keep the per-day recommendations array index-aligned with plan.days when a day
// is removed (delete/scatter). Drops the removed day's bucket; null passes through.
export function removeRecsDay(
  recs: RecommendationsByDay | null,
  dayIdx: number
): RecommendationsByDay | null {
  if (!recs) return recs
  return recs.filter((_, i) => i !== dayIdx)
}

export function centroidOf(
  places: { lat: number; lng: number }[]
): { lat: number; lng: number } | null {
  if (places.length === 0) return null
  const lat = places.reduce((s, p) => s + p.lat, 0) / places.length
  const lng = places.reduce((s, p) => s + p.lng, 0) / places.length
  return { lat, lng }
}

export function dedupeAndExclude(
  recs: DayRecommendation[],
  excludePlaceIds: Set<string>
): DayRecommendation[] {
  const seen = new Set<string>()
  const out: DayRecommendation[] = []
  for (const r of recs) {
    if (!r.placeId || excludePlaceIds.has(r.placeId) || seen.has(r.placeId)) continue
    seen.add(r.placeId)
    out.push(r)
  }
  return out
}

export function assignToDays(
  recs: DayRecommendation[],
  days: DayItinerary[]
): DayRecommendation[][] {
  if (days.length === 0) return []
  const buckets: DayRecommendation[][] = days.map(() => [])
  for (const r of recs) {
    const idx = findClosestDay(days, r)
    buckets[idx].push(r)
  }
  return buckets
}

export function bucketByCategory(recs: DayRecommendation[]): CategoryArrays {
  const buckets: CategoryArrays = { dessert: [], attraction: [], restaurant: [] }
  for (const r of recs) {
    if (r.type === 'dessert') buckets.dessert.push(r)
    else if (r.type === 'restaurant') buckets.restaurant.push(r)
    else if (r.type === 'attraction') buckets.attraction.push(r)
    // accommodation intentionally ignored
  }
  return buckets
}

export function splitShownReserve(arr: DayRecommendation[], limit: number): CategoryList {
  return { shown: arr.slice(0, limit), reserve: arr.slice(limit) }
}
