import { selectCollectionBuckets, savedRowToRecommendation } from '@/lib/savedPlaces/select'
import type { SavedPlaceRow } from '@/lib/savedPlaces/types'
import type { Place } from '@/lib/types'

function place(p: Partial<Place> & { placeId: string; type: Place['type']; lat: number; lng: number }): Place {
  return {
    id: p.placeId, name: p.placeId, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null, localizedName: null, ...p,
  }
}
function row(placeId: string, type: Place['type'], lat: number, lng: number, listName = 'L'): SavedPlaceRow {
  return { id: placeId, listName, source: 'takeout_list', place: place({ placeId, type, lat, lng }) }
}

it('shapes a saved row into a DayRecommendation with collection labels', () => {
  const rec = savedRowToRecommendation(row('a', 'restaurant', 1, 1, '台南美食'))
  expect(rec).toMatchObject({ placeId: 'a', reason: '你的 Google Maps 收藏', sourceLabel: '地圖收藏 / 台南美食' })
})

it('buckets by type, sorts each by distance to center, caps shown at 5', () => {
  const rows: SavedPlaceRow[] = [
    row('far', 'attraction', 10, 10),
    row('near', 'attraction', 0.1, 0.1),
    ...Array.from({ length: 6 }, (_, i) => row(`r${i}`, 'restaurant', i, 0)),
  ]
  const buckets = selectCollectionBuckets(rows, { lat: 0, lng: 0 }, new Set())
  expect(buckets.attraction.shown.map((r) => r.placeId)).toEqual(['near', 'far'])
  expect(buckets.restaurant.shown).toHaveLength(5)
  expect(buckets.restaurant.reserve).toHaveLength(1)
})

it('excludes placeIds already in the day and tolerates a null center', () => {
  const rows = [row('a', 'dessert', 1, 1), row('b', 'dessert', 2, 2)]
  const buckets = selectCollectionBuckets(rows, null, new Set(['a']))
  expect(buckets.dessert.shown.map((r) => r.placeId)).toEqual(['b'])
})
