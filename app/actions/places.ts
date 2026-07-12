'use server'
import type { Place } from '@/lib/types'
import { randomUUID } from 'crypto'

const KEY = process.env.GOOGLE_MAPS_API_KEY!
const BASE = 'https://maps.googleapis.com/maps/api/place'
const DETAILS_FIELDS = [
  'place_id', 'name', 'geometry', 'formatted_address',
  'opening_hours', 'rating', 'photos', 'editorial_summary',
].join(',')

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
    photoUrl: zhResult.photos?.[0]
      ? `/api/photo?ref=${zhResult.photos[0].photo_reference}`
      : null,
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
