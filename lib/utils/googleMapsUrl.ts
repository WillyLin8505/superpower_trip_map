import type { LocalizedText } from '@/lib/types'

const NON_GOOGLE_PLACE_ID_PREFIXES = ['overture:', 'osm:', 'wikidata:', 'user:']

interface GoogleMapsPlace {
  placeId: string
  address?: string | null
  lat: number
  lng: number
  localizedName?: LocalizedText | null
}

function isGooglePlaceId(placeId: string): boolean {
  return !NON_GOOGLE_PLACE_ID_PREFIXES.some((prefix) => placeId.startsWith(prefix))
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function googleMapsSearchUrl(place: GoogleMapsPlace, displayName: string): string {
  const hasGooglePlaceId = isGooglePlaceId(place.placeId)
  // Google pins resolve exactly via query_place_id, so the query text is cosmetic.
  // Non-Google pins (Overture/OSM/user) can't, so the query IS the lookup — and the
  // zh-TW display name may be a machine translation that doesn't exist on Google Maps
  // (e.g. "樂痛日麵包" for "Le Pain Quotidien"). Search the original/native name instead.
  const searchName = hasGooglePlaceId
    ? displayName
    : cleanText(place.localizedName?.original) ?? cleanText(place.localizedName?.en) ?? displayName
  const query = [searchName.trim(), place.address?.trim()].filter(Boolean).join(' ')
  const params = new URLSearchParams({
    api: '1',
    query: query || `${place.lat},${place.lng}`,
  })

  if (hasGooglePlaceId) {
    params.set('query_place_id', place.placeId)
  }

  return `https://www.google.com/maps/search/?${params.toString()}`
}
