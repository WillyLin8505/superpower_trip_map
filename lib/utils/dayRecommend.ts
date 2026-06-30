import type { CategoryBuckets, DayItinerary, DayRecommendation } from '@/lib/types'
import { findClosestDay } from './geo'

export const REC_CATEGORIES = ['dessert', 'attraction', 'restaurant'] as const

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
  const buckets: DayRecommendation[][] = days.map(() => [])
  for (const r of recs) {
    const idx = findClosestDay(days, r)
    buckets[idx].push(r)
  }
  return buckets
}

export function bucketByCategory(recs: DayRecommendation[]): CategoryBuckets {
  const buckets: CategoryBuckets = { dessert: [], attraction: [], restaurant: [] }
  for (const r of recs) {
    if (r.type === 'dessert') buckets.dessert.push(r)
    else if (r.type === 'restaurant') buckets.restaurant.push(r)
    else if (r.type === 'attraction') buckets.attraction.push(r)
    // accommodation intentionally ignored
  }
  return buckets
}

export function capBuckets(buckets: CategoryBuckets, limit: number): CategoryBuckets {
  return {
    dessert: buckets.dessert.slice(0, limit),
    attraction: buckets.attraction.slice(0, limit),
    restaurant: buckets.restaurant.slice(0, limit),
  }
}
