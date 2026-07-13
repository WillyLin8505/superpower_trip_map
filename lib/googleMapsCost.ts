type GoogleMapsFetchOptions = RequestInit & {
  next?: { revalidate?: number }
}

export function googleMapsCacheSeconds(): number {
  const value = Number(process.env.GOOGLE_MAPS_CACHE_SECONDS ?? 86400)
  return Number.isFinite(value) && value > 0 ? value : 86400
}

export function googleMapsFetchOptions(): GoogleMapsFetchOptions {
  return {
    cache: 'force-cache',
    next: { revalidate: googleMapsCacheSeconds() },
  }
}

export function googleMapsPhotoCacheControl(): string {
  const seconds = googleMapsCacheSeconds()
  return `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 7}`
}

export function shouldUseLiveDistanceMatrix(): boolean {
  const mode = process.env.GOOGLE_MAPS_DISTANCE_MATRIX_MODE ?? (process.env.NODE_ENV === 'test' ? 'live' : 'haversine')
  return mode === 'live'
}

export function shouldEnrichRecommendationsWithDetails(): boolean {
  const mode = process.env.GOOGLE_MAPS_RECOMMENDATION_DETAILS_MODE ?? (process.env.NODE_ENV === 'test' ? 'live' : 'nearby-only')
  return mode === 'live'
}

export function roundedCoordinate(value: number): number {
  return Math.round(value * 1000) / 1000
}
