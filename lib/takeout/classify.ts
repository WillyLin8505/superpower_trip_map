import type { PlaceType } from '@/lib/types'

const DESSERT = new Set(['bakery', 'cafe', 'ice_cream_shop', 'ice_cream', 'confectionery', 'dessert', 'dessert_shop'])
const RESTAURANT = new Set(['restaurant', 'food', 'meal_takeaway', 'meal_delivery', 'diner', 'bar'])
const LODGING = new Set(['lodging', 'hotel', 'motel', 'resort_hotel', 'guest_house'])

// Dessert is checked before restaurant so a "cafe + restaurant + food" place lands
// in dessert (matches the app's cafe-first bias in lib/utils/placeShortDescription.ts).
export function classifyPlaceType(googleTypes: string[]): PlaceType {
  const set = new Set(googleTypes)
  if ([...DESSERT].some((t) => set.has(t))) return 'dessert'
  if ([...LODGING].some((t) => set.has(t))) return 'accommodation'
  if ([...RESTAURANT].some((t) => set.has(t))) return 'restaurant'
  return 'attraction'
}
