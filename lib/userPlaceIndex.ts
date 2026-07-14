import type { Place, PlaceType } from '@/lib/types'

export interface UserPlaceIndexRow {
  owner_id: string
  place_id: string
  name: string
  lat: number
  lng: number
  category: PlaceType
}

export function buildUserPlaceIndexRow(
  ownerId: string,
  place: Pick<Place, 'placeId' | 'name' | 'lat' | 'lng' | 'type'>
): UserPlaceIndexRow {
  return {
    owner_id: ownerId,
    place_id: place.placeId,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    category: place.type,
  }
}
