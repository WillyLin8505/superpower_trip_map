'use server'
import type { Place } from '@/lib/types'
import { randomUUID } from 'crypto'
import { googleMapsFetchOptions, roundedCoordinate, shouldServeGooglePhotoMedia } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { cachedGoogle, RETRYABLE_GOOGLE_STATUSES } from '@/lib/googleCache'
import { readCachedPlaceId, writeCachedPlaceId } from '@/lib/placeIdCache'
import { placeShortDescription } from '@/lib/utils/placeShortDescription'
import { translateTextToZhTw } from '@/lib/aiTranslate'

const KEY = process.env.GOOGLE_MAPS_API_KEY!
const BASE = 'https://maps.googleapis.com/maps/api/place'
const DETAILS_FIELDS = [
  'place_id', 'name', 'geometry', 'formatted_address',
  'opening_hours', 'rating', 'photos', 'editorial_summary',
].join(',')
const ESSENTIALS_FIELDS = ['place_id', 'name', 'geometry', 'formatted_address', 'type'].join(',')

function mapPhotoUrls(photos?: Array<{ photo_reference: string }>): string[] {
  if (!shouldServeGooglePhotoMedia()) return []
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
  // Throw on transient failures so the cached result never persists one.
  if (data.status && RETRYABLE_GOOGLE_STATUSES.has(data.status)) {
    throw new Error(`place_details_${data.status}`)
  }
  return data.status === 'OK' ? data.result : null
}

async function fetchPlaceEssentials(placeId: string) {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: ESSENTIALS_FIELDS,
    key: KEY,
    language: 'zh-TW',
  })
  const url = `${BASE}/details/json?${params.toString()}`
  const res = await trackedApiFetch(url, googleMapsFetchOptions(), {
    provider: 'google_maps',
    endpoint: 'place_details',
    skuHint: 'place_details_essentials',
    metadata: { mode: 'import_essentials' },
  })
  const data = await res.json()
  if (data.status && RETRYABLE_GOOGLE_STATUSES.has(data.status)) {
    throw new Error(`place_essentials_${data.status}`)
  }
  return data.status === 'OK' ? data.result : null
}

export async function getPlaceDetails(placeId: string, originalNameHint?: string | null): Promise<Place | null> {
  // 52% of Place Details calls were exact repeats. Cache the resolved Place by
  // (placeId, name hint). A transient Google status throws inside the fetcher so
  // the failure is never cached — but we then catch it here and return null,
  // preserving getPlaceDetails' long-standing "null on failure" contract (callers
  // like plan.ts / searchPlace are not prepared for a rejection).
  try {
    const place = await cachedGoogle(['details', placeId, originalNameHint ?? ''], () =>
      getPlaceDetailsUncached(placeId, originalNameHint),
    )
    // The cached Place carries one frozen randomUUID; mint a fresh app-level id
    // per call so list/DnD identity is never shared across cache hits.
    return place ? { ...place, id: randomUUID() } : null
  } catch {
    return null
  }
}

async function getPlaceDetailsUncached(placeId: string, originalNameHint?: string | null): Promise<Place | null> {
  const [zhResult, nativeResult] = await Promise.all([
    fetchPlaceDetails(placeId, 'zh-TW'),
    originalNameHint ? Promise.resolve(null) : fetchPlaceDetails(placeId),
  ])
  if (!zhResult) return null

  const originalName = cleanText(originalNameHint) ?? cleanText(nativeResult?.name) ?? cleanText(zhResult.name)
  const originalAddress = cleanText(nativeResult?.formatted_address) ?? cleanText(zhResult.formatted_address)
  const googleZhName = hasHanText(zhResult.name) ? cleanText(zhResult.name) : null
  const zhAddress = hasHanText(zhResult.formatted_address) ? cleanText(zhResult.formatted_address) : null
  const needsEnglish = !googleZhName || !zhAddress
  const enResult = needsEnglish ? await fetchPlaceDetails(placeId, 'en') : null
  const cleanEnName = cleanText(enResult?.name)
  const cleanEnAddress = cleanText(enResult?.formatted_address)
  const translatedZhName = googleZhName ?? await translateTextToZhTw(originalName ?? cleanEnName ?? cleanText(zhResult.name))
  const enName = !googleZhName ? resolveEnglishName(cleanEnName, zhResult.name, originalName) : null
  const enAddress = cleanEnAddress && cleanEnAddress !== zhResult.formatted_address ? cleanEnAddress : null
  const displayName = translatedZhName ?? enName ?? originalName ?? zhResult.name
  const displayAddress = zhAddress ?? enAddress ?? zhResult.formatted_address ?? ''
  const photoUrls = mapPhotoUrls(zhResult.photos)

  return {
    id: randomUUID(),
    placeId,
    name: displayName,
    localizedName: {
      zhTw: translatedZhName,
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

export async function searchPlaceEssentials(query: string, countryName?: string): Promise<Place | null> {
  const cachedPlaceId = await readCachedPlaceId(query, countryName)
  let placeId = cachedPlaceId

  if (!placeId) {
    const input = countryName ? `${query}, ${countryName}` : query
    const url =
      `${BASE}/findplacefromtext/json` +
      `?input=${encodeURIComponent(input)}&inputtype=textquery` +
      `&fields=place_id&key=${KEY}`
    const res = await trackedApiFetch(url, googleMapsFetchOptions(), {
      provider: 'google_maps',
      endpoint: 'find_place_from_text',
      skuHint: 'find_place_from_text_id_only',
      metadata: { mode: 'import_essentials' },
    })
    const data = await res.json()
    placeId = data.candidates?.[0]?.place_id ?? null
  }

  if (!placeId) return null

  try {
    const result = await cachedGoogle(['essentials', placeId], () => fetchPlaceEssentials(placeId))
    if (!result?.geometry?.location) return null
    if (!cachedPlaceId) await writeCachedPlaceId(query, countryName, placeId)

    const name = cleanText(result.name) ?? cleanText(query) ?? placeId
    const originalName = originalNameHintFromQuery(query) ?? name
    const zhName = hasHanText(name) ? name : null
    const address = cleanText(result.formatted_address) ?? ''
    const zhAddress = hasHanText(address) ? address : null

    return {
      id: randomUUID(),
      placeId,
      source: 'google',
      name: zhName ?? name,
      localizedName: {
        zhTw: zhName,
        original: originalName,
      },
      type: 'attraction',
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      address,
      localizedAddress: {
        zhTw: zhAddress,
        original: address,
      },
      openingHours: null,
      rating: null,
      photoUrl: null,
      photoUrls: [],
      description: null,
    }
  } catch {
    return null
  }
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

type NearbyPlaceType = 'attraction' | 'restaurant' | 'dessert'
type NearbyQuery = { type?: string; keyword?: string; radius?: number }
const NEARBY_CACHE_VERSION = '2'
const NEARBY_DEFAULT_RADIUS_METERS = 4000
const NEARBY_CANDIDATE_LIMIT = 20

const NEARBY_QUERIES: Record<NearbyPlaceType, NearbyQuery[]> = {
  attraction: [
    { type: 'tourist_attraction' },
    { keyword: 'sightseeing landmark museum temple park tourist attraction', radius: 12000 },
  ],
  restaurant: [
    { type: 'restaurant', keyword: 'local lunch dinner restaurant' },
    { keyword: 'local lunch dinner restaurant food', radius: 12000 },
  ],
  dessert: [
    { keyword: 'dessert cafe bakery cake drinks' },
    { keyword: 'bakery sweets patisserie dessert cafe drinks', radius: 12000 },
  ],
}

const LODGING_TYPES = new Set(['lodging', 'hotel', 'motel', 'hostel', 'resort', 'campground', 'rv_park'])
const LODGING_NAME_RE = /\b(hotel|hostel|resort|motel|homestay|villa|suite|suites|apartment|apartments|serviced apartment)\b/i

interface NearbyPlaceResult {
  place_id: string
  name: string
  geometry?: { location?: { lat: number; lng: number } }
  vicinity?: string
  rating?: number
  user_ratings_total?: number
  types?: string[]
  photos?: Array<{ photo_reference: string }>
}

function isLodgingLike(result: NearbyPlaceResult): boolean {
  return (result.types ?? []).some((type) => LODGING_TYPES.has(type)) || LODGING_NAME_RE.test(result.name)
}

export async function nearbySearch(
  lat: number,
  lng: number,
  placeType: NearbyPlaceType
): Promise<Place[]> {
  const searchLat = roundedCoordinate(lat)
  const searchLng = roundedCoordinate(lng)
  return cachedGoogle([NEARBY_CACHE_VERSION, 'nearby', String(searchLat), String(searchLng), placeType], async () => {
  const out: Place[] = []
  const seen = new Set<string>()

  for (const q of NEARBY_QUERIES[placeType]) {
    const radius = q.radius ?? NEARBY_DEFAULT_RADIUS_METERS
    const params = new URLSearchParams({
      location: `${searchLat},${searchLng}`,
      radius: String(radius),
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
      metadata: { placeType, radius, query: q },
    })
    const data = await res.json()
    // Never cache a transient failure — throw so cachedGoogle skips it and the
    // next call retries Google (a non-OK deterministic status like ZERO_RESULTS
    // falls through to `continue` and is safely cached as an empty area).
    if (data.status && RETRYABLE_GOOGLE_STATUSES.has(data.status)) {
      throw new Error(`nearby_search_${data.status}`)
    }
    if (data.status !== 'OK' || !Array.isArray(data.results)) continue

    const results = (data.results as NearbyPlaceResult[])
      .filter((result) => placeType !== 'restaurant' || !isLodgingLike(result))

    for (const r of results) {
      if (seen.has(r.place_id)) continue
      seen.add(r.place_id)
      const photoUrls = mapPhotoUrls(r.photos)
      const googleZhName = hasHanText(r.name) ? cleanText(r.name) : null
      const originalName = cleanText(r.name)
      const translatedZhName = googleZhName ?? await translateTextToZhTw(originalName)
      const enName = translatedZhName ? null : latinizedName(originalName)
      const displayName = translatedZhName ?? enName ?? originalName ?? r.name
      out.push({
        id: randomUUID(),
        placeId: r.place_id,
        name: displayName,
        localizedName: {
          zhTw: translatedZhName,
          ...(enName ? { en: enName } : {}),
          original: originalName,
        },
        type: placeType,
        lat: r.geometry?.location?.lat ?? lat,
        lng: r.geometry?.location?.lng ?? lng,
        address: r.vicinity ?? '',
        openingHours: null,
        rating: r.rating ?? null,
        reviewCount: r.user_ratings_total ?? null,
        categoryTags: r.types ?? [],
        photoUrl: photoUrls[0] ?? null,
        photoUrls,
        description: placeShortDescription(placeType, r.types),
      })
    }
    if (out.length >= NEARBY_CANDIDATE_LIMIT) break
  }

  return out.slice(0, NEARBY_CANDIDATE_LIMIT)
  })
}
