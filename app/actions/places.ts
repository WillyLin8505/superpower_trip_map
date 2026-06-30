'use server'
import type { Place } from '@/lib/types'
import { randomUUID } from 'crypto'

const KEY = process.env.GOOGLE_MAPS_API_KEY!
const BASE = 'https://maps.googleapis.com/maps/api/place'

export async function getPlaceDetails(placeId: string): Promise<Place | null> {
  const fields = [
    'place_id', 'name', 'geometry', 'formatted_address',
    'opening_hours', 'rating', 'photos', 'editorial_summary',
  ].join(',')
  const url = `${BASE}/details/json?place_id=${placeId}&fields=${fields}&key=${KEY}&language=zh-TW`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  const data = await res.json()
  if (data.status !== 'OK') return null
  const r = data.result

  return {
    id: randomUUID(),
    placeId,
    name: r.name,
    type: 'attraction',  // caller sets the correct type
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address ?? '',
    openingHours: r.opening_hours?.weekday_text ?? null,
    rating: r.rating ?? null,
    photoUrl: r.photos?.[0]
      ? `/api/photo?ref=${r.photos[0].photo_reference}`
      : null,
    description: r.editorial_summary?.overview ?? null,
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
): Promise<{ placeId: string; lat: number; lng: number } | null> {
  const place = await searchPlace(name)
  if (!place) return null
  return { placeId: place.placeId, lat: place.lat, lng: place.lng }
}

const NEARBY_QUERY: Record<'attraction' | 'restaurant' | 'dessert', { type?: string; keyword?: string }> = {
  attraction: { type: 'tourist_attraction' },
  restaurant: { type: 'restaurant' },
  dessert: { keyword: '甜點 dessert cafe' },
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

  return data.results.map(
    (r: any): Place => ({
      id: randomUUID(),
      placeId: r.place_id,
      name: r.name,
      type: placeType,
      lat: r.geometry?.location?.lat ?? lat,
      lng: r.geometry?.location?.lng ?? lng,
      address: r.vicinity ?? '',
      openingHours: null,
      rating: r.rating ?? null,
      photoUrl: r.photos?.[0] ? `/api/photo?ref=${r.photos[0].photo_reference}` : null,
      description: null,
    })
  )
}
