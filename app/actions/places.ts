'use server'
import type { Place } from '@/lib/types'
import { randomUUID } from 'crypto'
import { googleMapsFetchOptions, roundedCoordinate } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { readCachedPlaceId, writeCachedPlaceId } from '@/lib/placeIdCache'

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

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function originalNameHintFromQuery(query: string): string | null {
  const trimmed = query.trim()
  if (!trimmed || /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return null
  return trimmed
}

function latinizedName(value: string | null | undefined): string | null {
  const original = cleanText(value)
  if (!original || hasHanText(original) || !/[A-Za-z]/.test(original)) return null
  const latinized = original
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .trim()
  return latinized && latinized !== original ? latinized : null
}

function isAsciiText(value: string | null | undefined): value is string {
  return Boolean(value && /^[\x00-\x7F]+$/.test(value) && /[A-Za-z]/.test(value))
}

function resolveEnglishName(
  enName: string | null | undefined,
  zhResultName: string | null | undefined,
  originalName: string | null
): string | null {
  const candidates = [cleanText(enName), cleanText(zhResultName)]
  const asciiCandidate = candidates.find((candidate) => candidate !== null && candidate !== originalName && isAsciiText(candidate))
  if (asciiCandidate) return asciiCandidate
  const translatedCandidate = candidates.find((candidate) => candidate !== null && candidate !== originalName)
  return translatedCandidate ?? latinizedName(originalName)
}

async function fetchPlaceDetails(placeId: string, language?: 'zh-TW' | 'en') {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: DETAILS_FIELDS,
    key: KEY,
  })
  if (language) params.set('language', language)
  const url = `${BASE}/details/json?${params.toString()}`
  const res = await trackedApiFetch(url, googleMapsFetchOptions(), {
    provider: 'google_maps',
    endpoint: 'place_details',
    skuHint: 'place_details_pro',
    metadata: { language: language ?? 'default' },
  })
  const data = await res.json()
  return data.status === 'OK' ? data.result : null
}

export async function getPlaceDetails(placeId: string, originalNameHint?: string | null): Promise<Place | null> {
  const [zhResult, nativeResult] = await Promise.all([
    fetchPlaceDetails(placeId, 'zh-TW'),
    originalNameHint ? Promise.resolve(null) : fetchPlaceDetails(placeId),
  ])
  if (!zhResult) return null

  const originalName = cleanText(originalNameHint) ?? cleanText(nativeResult?.name) ?? cleanText(zhResult.name)
  const originalAddress = cleanText(nativeResult?.formatted_address) ?? cleanText(zhResult.formatted_address)
  const zhName = hasHanText(zhResult.name) ? cleanText(zhResult.name) : null
  const zhAddress = hasHanText(zhResult.formatted_address) ? cleanText(zhResult.formatted_address) : null
  const needsEnglish = !zhName || !zhAddress
  const enResult = needsEnglish ? await fetchPlaceDetails(placeId, 'en') : null
  const cleanEnName = cleanText(enResult?.name)
  const cleanEnAddress = cleanText(enResult?.formatted_address)
  const enName = !zhName ? resolveEnglishName(cleanEnName, zhResult.name, originalName) : null
  const enAddress = cleanEnAddress && cleanEnAddress !== zhResult.formatted_address ? cleanEnAddress : null
  const displayName = zhName ?? enName ?? originalName ?? zhResult.name
  const displayAddress = zhAddress ?? enAddress ?? zhResult.formatted_address ?? ''
  const photoUrls = mapPhotoUrls(zhResult.photos)

  return {
    id: randomUUID(),
    placeId,
    name: displayName,
    localizedName: {
      zhTw: zhName,
      ...(enName ? { en: enName } : {}),
      original: originalName,
    },
    type: 'attraction',  // caller sets the correct type
    lat: zhResult.geometry.location.lat,
    lng: zhResult.geometry.location.lng,
    address: displayAddress,
    localizedAddress: {
      zhTw: zhAddress,
      ...(enAddress ? { en: enAddress } : {}),
      original: originalAddress,
    },
    openingHours: zhResult.opening_hours?.weekday_text ?? null,
    rating: zhResult.rating ?? null,
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    description: zhResult.editorial_summary?.overview ?? null,
  }
}

export async function searchPlace(query: string, countryName?: string): Promise<Place | null> {
  const cachedPlaceId = await readCachedPlaceId(query, countryName)
  if (cachedPlaceId) {
    const cachedPlace = await getPlaceDetails(cachedPlaceId, originalNameHintFromQuery(query))
    if (cachedPlace) return cachedPlace
  }

  const input = countryName ? `${query}, ${countryName}` : query
  const url =
    `${BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(input)}&inputtype=textquery` +
    `&fields=place_id&key=${KEY}`
  const res = await trackedApiFetch(url, googleMapsFetchOptions(), {
    provider: 'google_maps',
    endpoint: 'find_place_from_text',
    skuHint: 'find_place_from_text_id_only',
  })
  const data = await res.json()
  const placeId = data.candidates?.[0]?.place_id
  if (!placeId) return null
  const place = await getPlaceDetails(placeId, originalNameHintFromQuery(query))
  if (place) await writeCachedPlaceId(query, countryName, placeId)
  return place
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
  const searchLat = roundedCoordinate(lat)
  const searchLng = roundedCoordinate(lng)
  const params = new URLSearchParams({
    location: `${searchLat},${searchLng}`,
    radius: '4000',
    key: KEY,
    language: 'zh-TW',
  })
  if (q.type) params.set('type', q.type)
  if (q.keyword) params.set('keyword', q.keyword)

  const url = `${BASE}/nearbysearch/json?${params.toString()}`
  const res = await trackedApiFetch(url, googleMapsFetchOptions(), {
    provider: 'google_maps',
    endpoint: 'nearby_search',
    skuHint: 'nearby_search_pro',
    metadata: { placeType, radius: 4000 },
  })
  const data = await res.json()
  if (data.status !== 'OK' || !Array.isArray(data.results)) return []

  return (data.results as NearbyPlaceResult[]).map(
    (r): Place => {
      const photoUrls = mapPhotoUrls(r.photos)
      const zhName = hasHanText(r.name) ? cleanText(r.name) : null
      const originalName = cleanText(r.name)
      const enName = zhName ? null : latinizedName(originalName)
      const displayName = zhName ?? enName ?? originalName ?? r.name
      return {
        id: randomUUID(),
        placeId: r.place_id,
        name: displayName,
        localizedName: {
          zhTw: zhName,
          ...(enName ? { en: enName } : {}),
          original: originalName,
        },
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
