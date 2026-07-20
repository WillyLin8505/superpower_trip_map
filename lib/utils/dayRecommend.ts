import type { CategoryArrays, CategoryList, DayItinerary, DayRecommendation, LocalizedText, RecommendationsByDay } from '@/lib/types'
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

type PlaceIdentityInput = {
  id?: string | null
  placeId?: string | null
  name?: string | null
  localizedName?: LocalizedText | null
  lat?: number | null
  lng?: number | null
}

function cleanIdentityText(value: string | null | undefined): string | null {
  const cleaned = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^0-9a-z\u00c0-\u024f\u1e00-\u1eff\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  return cleaned || null
}

function coordinateBucket(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value.toFixed(3)
}

function uniqueIdentityNames(place: PlaceIdentityInput): string[] {
  const original = cleanIdentityText(place.localizedName?.original)
  const english = cleanIdentityText(place.localizedName?.en)
  const primary = cleanIdentityText(place.name)
  const translatedChinese = cleanIdentityText(place.localizedName?.zhTw)
  const values: Array<string | null> = [original, english]
  if (primary && primary !== translatedChinese) values.push(primary)
  const hasStableName = values.some((value) => value !== null)
  if (!hasStableName) {
    if (primary) values.push(primary)
    if (translatedChinese) values.push(translatedChinese)
  }
  return Array.from(new Set(values.map(cleanIdentityText).filter((value): value is string => value !== null)))
}

export function recommendationIdentityKeys(place: PlaceIdentityInput): string[] {
  const keys: string[] = []
  if (place.placeId) {
    keys.push(place.placeId)
    keys.push(`place:${place.placeId}`)
  } else if (place.id) {
    keys.push(`local:${place.id}`)
  }

  const lat = coordinateBucket(place.lat)
  const lng = coordinateBucket(place.lng)
  for (const name of uniqueIdentityNames(place)) {
    if (lat && lng) {
      keys.push(`namegeo:${name}:${lat}:${lng}`)
    }
    if (name.length >= 2) {
      keys.push(`name:${name}`)
    }
  }

  return Array.from(new Set(keys))
}

export function addRecommendationIdentityKeys(target: Set<string>, place: PlaceIdentityInput): void {
  recommendationIdentityKeys(place).forEach((key) => target.add(key))
}

export function hasRecommendationIdentity(target: Set<string>, place: PlaceIdentityInput): boolean {
  return recommendationIdentityKeys(place).some((key) => target.has(key))
}

export function deleteRecommendationIdentityKeys(target: Set<string>, place: PlaceIdentityInput): void {
  recommendationIdentityKeys(place).forEach((key) => target.delete(key))
}

export function dedupeAndExclude(
  recs: DayRecommendation[],
  excludeKeys: Set<string>
): DayRecommendation[] {
  const seen = new Set<string>()
  const out: DayRecommendation[] = []
  for (const r of recs) {
    const keys = recommendationIdentityKeys(r)
    if (keys.length === 0 || keys.some((key) => excludeKeys.has(key) || seen.has(key))) continue
    keys.forEach((key) => seen.add(key))
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
