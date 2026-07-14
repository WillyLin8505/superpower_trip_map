import type { Place, PlaceDataSource, PlaceType } from '@/lib/types'

export type PlaceIndexSource = PlaceDataSource

export interface UserPlaceIndexRow {
  owner_id: string
  source: PlaceIndexSource
  place_id: string
  name: string
  lat: number
  lng: number
  category: PlaceType
  expires_at: string | null
}

export interface UserPlaceIndexOptions {
  source?: PlaceIndexSource
  now?: Date
}

const GOOGLE_PLACE_INDEX_TTL_DAYS = 30

function expiresAtForSource(source: PlaceIndexSource, now: Date): string | null {
  if (source !== 'google') return null
  const expiresAt = new Date(now.getTime())
  expiresAt.setUTCDate(expiresAt.getUTCDate() + GOOGLE_PLACE_INDEX_TTL_DAYS)
  return expiresAt.toISOString()
}

export function buildUserPlaceIndexRow(
  ownerId: string,
  place: Pick<Place, 'placeId' | 'name' | 'lat' | 'lng' | 'type'>,
  options: UserPlaceIndexOptions = {}
): UserPlaceIndexRow {
  const source = options.source ?? 'google'
  const now = options.now ?? new Date()
  return {
    owner_id: ownerId,
    source,
    place_id: place.placeId,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    category: place.type,
    expires_at: expiresAtForSource(source, now),
  }
}
