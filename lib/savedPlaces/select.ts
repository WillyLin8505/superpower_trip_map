import type { CategoryBuckets, DayRecommendation } from '@/lib/types'
import type { SavedPlaceRow } from './types'
import { bucketByCategory, splitShownReserve, dedupeAndExclude } from '@/lib/utils/dayRecommend'

const SHOWN_LIMIT = 5

function distSq(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = a.lat - b.lat, dy = a.lng - b.lng
  return dx * dx + dy * dy
}

export function savedRowToRecommendation(row: SavedPlaceRow): DayRecommendation {
  return { ...row.place, reason: '你的 Google Maps 收藏', sourceLabel: `地圖收藏 / ${row.listName}` }
}

export function selectCollectionBuckets(
  rows: SavedPlaceRow[],
  center: { lat: number; lng: number } | null,
  excludePlaceIds: Set<string>,
): CategoryBuckets {
  const recs = dedupeAndExclude(rows.map(savedRowToRecommendation), excludePlaceIds)
  const ordered = center ? [...recs].sort((a, b) => distSq(a, center) - distSq(b, center)) : recs
  const byCat = bucketByCategory(ordered)
  return {
    dessert: splitShownReserve(byCat.dessert, SHOWN_LIMIT),
    attraction: splitShownReserve(byCat.attraction, SHOWN_LIMIT),
    restaurant: splitShownReserve(byCat.restaurant, SHOWN_LIMIT),
  }
}
