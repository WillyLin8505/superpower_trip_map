'use server'
import type { Place } from '@/lib/types'
import { randomUUID } from 'crypto'

const KEY = process.env.GOOGLE_MAPS_API_KEY!
const BASE = 'https://maps.googleapis.com/maps/api/place'
const DETAILS_FIELDS = [
  'place_id', 'name', 'geometry', 'formatted_address',
  'opening_hours', 'rating', 'photos', 'editorial_summary',
].join(',')

function mapPhotoUrls(photos?: Array<{ photo_reference: string }>): string[] {
  return (photos ?? [])
    .slice(0, 5)
    .map((photo) => `/api/photo?ref=${encodeURIComponent(photo.photo_reference)}`)
}

function hasHanText(value: string | null | undefined): boolean {
  return /[\u3400-\u9fff]/.test(value ?? '')
}

async function fetchPlaceDetails(placeId: string, language: 'zh-TW' | 'en') {
  const url = `${BASE}/details/json?place_id=${placeId}&fields=${DETAILS_FIELDS}&key=${KEY}&language=${language}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()
  return data.status === 'OK' ? data.result : null
}

export async function getPlaceDetails(placeId: string): Promise<Place | null> {
  const zhResult = await fetchPlaceDetails(placeId, 'zh-TW')
  if (!zhResult) return null

  const zhName = hasHanText(zhResult.name) ? zhResult.name : null
  const zhAddress = hasHanText(zhResult.formatted_address) ? zhResult.formatted_address : null
  const needsEnglish = !zhName || !zhAddress
  const enResult = needsEnglish ? await fetchPlaceDetails(placeId, 'en') : null
  const enName = enResult?.name && enResult.name !== zhResult.name ? enResult.name : null
  const enAddress = enResult?.formatted_address && enResult.formatted_address !== zhResult.formatted_address
    ? enResult.formatted_address
    : null
  const displayName = zhName ?? enName ?? zhResult.name
  const displayAddress = zhAddress ?? enAddress ?? zhResult.formatted_address ?? ''
  const photoUrls = mapPhotoUrls(zhResult.photos)

  return {
    id: randomUUID(),
    placeId,
    name: displayName,
    localizedName: {
      zhTw: zhName,
      ...(enName ? { en: enName } : {}),
      original: zhResult.name ?? null,
    },
    type: 'attraction',  // caller sets the correct type
    lat: zhResult.geometry.location.lat,
    lng: zhResult.geometry.location.lng,
    address: displayAddress,
    localizedAddress: {
      zhTw: zhAddress,
      ...(enAddress ? { en: enAddress } : {}),
      original: zhResult.formatted_address ?? null,
    },
    openingHours: zhResult.opening_hours?.weekday_text ?? null,
    rating: zhResult.rating ?? null,
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    description: zhResult.editorial_summary?.overview ?? null,
  }
}

export async function searchPlace(query: string, countryName?: string): Promise<Place | null> {
  const input = countryName ? `${query}, ${countryName}` : query
  const url =
    `${BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(input)}&inputtype=textquery` +
    `&fields=place_id&key=${KEY}`
  const res = await fetch(url)
  const data = await res.json()
  const placeId = data.candidates?.[0]?.place_id
  if (!placeId) return null
  return getPlaceDetails(placeId)
}

export async function verifyPlace(
  name: string
): Promise<Pick<Place, 'placeId' | 'lat' | 'lng' | 'localizedName' | 'localizedAddress'> | null> {
  const place = await searchPlace(name)
  if (!place) return null
  return {
    placeId: place.placeId,
    lat: place.lat,
    lng: place.lng,
    localizedName: place.localizedName,
    localizedAddress: place.localizedAddress,
  }
}

const NEARBY_QUERY: Record<'attraction' | 'restaurant' | 'dessert', { type?: string; keyword?: string }> = {
  attraction: { type: 'tourist_attraction' },
  restaurant: { type: 'restaurant' },
  dessert: { keyword: '甜點 dessert cafe' },
}

interface NearbyPlaceResult {
  place_id: string
  name: string
  geometry?: { location?: { lat: number; lng: number } }
  vicinity?: string
  rating?: number
  photos?: Array<{ photo_reference: string }>
}

export async function nearbySearch(
  lat: number,
  lng: number,
  placeType: 'attraction' | 'restaurant' | 'dessert'
): Promise<Place[]> {
  const q = NEARBY_QUERY[placeType]
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: '4000',
    key: KEY,
    language: 'zh-TW',
  })
  if (q.type) params.set('type', q.type)
  if (q.keyword) params.set('keyword', q.keyword)

  const url = `${BASE}/nearbysearch/json?${params.toString()}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()
  if (data.status !== 'OK' || !Array.isArray(data.results)) return []

  return (data.results as NearbyPlaceResult[]).map(
    (r): Place => {
      const photoUrls = mapPhotoUrls(r.photos)
      return {
        id: randomUUID(),
        placeId: r.place_id,
        name: r.name,
        type: placeType,
        lat: r.geometry?.location?.lat ?? lat,
        lng: r.geometry?.location?.lng ?? lng,
        address: r.vicinity ?? '',
        openingHours: null,
        rating: r.rating ?? null,
        photoUrl: photoUrls[0] ?? null,
        photoUrls,
        description: null,
      }
    }
  )
}
