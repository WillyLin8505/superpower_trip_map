const NON_GOOGLE_PLACE_ID_PREFIXES = ['overture:', 'osm:', 'wikidata:', 'user:']

interface GoogleMapsPlace {
  placeId: string
  address?: string | null
  lat: number
  lng: number
}

function isGooglePlaceId(placeId: string): boolean {
  return !NON_GOOGLE_PLACE_ID_PREFIXES.some((prefix) => placeId.startsWith(prefix))
}

export function googleMapsSearchUrl(place: GoogleMapsPlace, displayName: string): string {
  const query = [displayName.trim(), place.address?.trim()].filter(Boolean).join(' ')
  const params = new URLSearchParams({
    api: '1',
    query: query || `${place.lat},${place.lng}`,
  })

  if (isGooglePlaceId(place.placeId)) {
    params.set('query_place_id', place.placeId)
  }

  return `https://www.google.com/maps/search/?${params.toString()}`
}
