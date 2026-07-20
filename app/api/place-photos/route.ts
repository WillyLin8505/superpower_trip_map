import { NextRequest, NextResponse } from 'next/server'
import { googleMapsFetchOptions, googleMapsPhotoCacheControl, roundedCoordinate } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { tripIdFromReferer } from '@/lib/apiUsageContext'
import { cachedGoogle, RETRYABLE_GOOGLE_STATUSES } from '@/lib/googleCache'
import { resolveFreeImageForPlace } from '@/lib/openPoi'
import type { PlaceType } from '@/lib/types'

const BASE = 'https://maps.googleapis.com/maps/api/place'

function mapPhotoUrls(photos: Array<{ photo_reference: string }> | undefined, limit: number): string[] {
  return (photos ?? [])
    .slice(0, limit)
    .map((photo) => `/api/photo?ref=${encodeURIComponent(photo.photo_reference)}`)
}

function parseLimit(value: string | null): number {
  if (value === null) return 5
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 5
  return Math.min(5, Math.max(1, Math.trunc(parsed)))
}

function parsePlaceType(value: string | null): PlaceType {
  if (value === 'restaurant' || value === 'dessert' || value === 'accommodation') return value
  return 'attraction'
}

function isGooglePlaceId(placeId: string): boolean {
  return placeId.length >= 16 && !placeId.includes(':')
}

function googleFallbackQueries(placeName: string, aliases: string[]): string[] {
  const values = [...aliases, placeName, [placeName, ...aliases].join(' ')]
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function parseCoordinate(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function googleLocationBias(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null
  return `circle:5000@${lat},${lng}`
}

function mergePhotoUrls(primary: string[], fallback: string[], limit: number): string[] {
  return Array.from(new Set([...primary, ...fallback].filter(Boolean))).slice(0, limit)
}

function shouldPreferGooglePhotos(category: PlaceType): boolean {
  return category === 'dessert' || category === 'restaurant' || category === 'accommodation'
}

async function googlePhotoUrlsForPlaceId(placeId: string, limit: number, tripId: string | null | undefined): Promise<string[]> {
  return cachedGoogle(['photos', placeId, String(limit)], async () => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY!
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'photos',
      key: apiKey,
      language: 'zh-TW',
    })
    const upstream = await trackedApiFetch(`${BASE}/details/json?${params.toString()}`, googleMapsFetchOptions(), {
      provider: 'google_maps',
      endpoint: 'place_photos_metadata',
      skuHint: 'place_details_photos',
      metadata: { limit },
      tripId,
    })
    if (!upstream.ok) throw new Error('place_photos_upstream_failed')
    const data = await upstream.json()
    if (data.status && RETRYABLE_GOOGLE_STATUSES.has(data.status)) {
      throw new Error(`place_photos_${data.status}`)
    }
    if (data.status !== 'OK') return []
    return mapPhotoUrls(data.result?.photos, limit)
  })
}

async function googlePlaceIdFromText({
  query,
  category,
  lat,
  lng,
  tripId,
}: {
  query: string
  category: PlaceType
  lat: number | null
  lng: number | null
  tripId: string | null | undefined
}): Promise<string | null> {
  if (!query) return null
  const locationBias = googleLocationBias(lat, lng)
  return cachedGoogle([
    'photo-fallback-place-id',
    category,
    query,
    locationBias ? String(roundedCoordinate(lat!)) : '',
    locationBias ? String(roundedCoordinate(lng!)) : '',
  ], async () => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY!
    const params = new URLSearchParams({
      input: query,
      inputtype: 'textquery',
      fields: 'place_id',
      key: apiKey,
      language: 'zh-TW',
    })
    if (locationBias) params.set('locationbias', locationBias)
    const upstream = await trackedApiFetch(`${BASE}/findplacefromtext/json?${params.toString()}`, googleMapsFetchOptions(), {
      provider: 'google_maps',
      endpoint: 'find_place_from_text_photo_fallback',
      skuHint: 'find_place_from_text_id_only',
      metadata: { category, query, fallback: 'place_photos' },
      tripId,
    })
    if (!upstream.ok) throw new Error('find_place_photo_fallback_upstream_failed')
    const data = await upstream.json()
    if (data.status && RETRYABLE_GOOGLE_STATUSES.has(data.status)) {
      throw new Error(`find_place_photo_fallback_${data.status}`)
    }
    if (data.status !== 'OK') return null
    const placeId = data.candidates?.[0]?.place_id
    return typeof placeId === 'string' && placeId.trim() ? placeId.trim() : null
  })
}

async function googlePhotoUrlsForTextFallback({
  placeName,
  aliases,
  category,
  lat,
  lng,
  limit,
  tripId,
}: {
  placeName: string
  aliases: string[]
  category: PlaceType
  lat: number | null
  lng: number | null
  limit: number
  tripId: string | null | undefined
}): Promise<string[]> {
  for (const query of googleFallbackQueries(placeName, aliases)) {
    const fallbackPlaceId = await googlePlaceIdFromText({ query, category, lat, lng, tripId })
    if (!fallbackPlaceId) continue
    const photoUrls = await googlePhotoUrlsForPlaceId(fallbackPlaceId, limit, tripId)
    if (photoUrls.length > 0) return photoUrls
  }
  return []
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId')
  if (!placeId) return NextResponse.json({ error: 'missing placeId' }, { status: 400 })
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'))
  const placeName = req.nextUrl.searchParams.get('placeName')?.trim()
  const aliases = req.nextUrl.searchParams.getAll('alias').map((alias) => alias.trim()).filter(Boolean)
  const category = parsePlaceType(req.nextUrl.searchParams.get('placeType'))
  const lat = parseCoordinate(req.nextUrl.searchParams.get('lat'))
  const lng = parseCoordinate(req.nextUrl.searchParams.get('lng'))
  const googlePlaceId = isGooglePlaceId(placeId)
  let freePhotoUrls: string[] = []
  if (placeName) {
    const freeImage = await resolveFreeImageForPlace({
      placeId,
      placeName,
      aliases,
      category,
      allowGeneric: false,
      limit,
    })
    freePhotoUrls = freeImage?.photoUrls.length && !freeImage.generic
      ? freeImage.photoUrls.slice(0, limit)
      : []
    if (freePhotoUrls.length >= limit && !shouldPreferGooglePhotos(category)) {
      return NextResponse.json(
        { photoUrls: freePhotoUrls, source: freeImage?.source },
        { headers: { 'cache-control': googleMapsPhotoCacheControl() } }
      )
    }
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { photoUrls: freePhotoUrls },
      { headers: { 'cache-control': googleMapsPhotoCacheControl() } }
    )
  }

  const tripId = tripIdFromReferer(req.headers.get('referer'), req.nextUrl.origin)

  try {
    const googlePlaceIdPhotoUrls = googlePlaceId
      ? await googlePhotoUrlsForPlaceId(placeId, limit, tripId)
      : []
    const shouldUseTextFallback = Boolean(placeName && (!googlePlaceId || googlePlaceIdPhotoUrls.length < limit))
    const googleTextPhotoUrls = shouldUseTextFallback
      ? await googlePhotoUrlsForTextFallback({ placeName: placeName!, aliases, category, lat, lng, limit, tripId })
      : []
    const googlePhotoUrls = mergePhotoUrls(googlePlaceIdPhotoUrls, googleTextPhotoUrls, limit)
    const photoUrls = shouldPreferGooglePhotos(category)
      ? mergePhotoUrls(googlePhotoUrls, freePhotoUrls, limit)
      : mergePhotoUrls(freePhotoUrls, googlePhotoUrls, limit)

    return NextResponse.json(
      { photoUrls },
      { headers: { 'cache-control': googleMapsPhotoCacheControl() } }
    )
  } catch {
    return NextResponse.json({ error: 'failed to fetch place photos' }, { status: 502 })
  }
}
