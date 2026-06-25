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
      ? `${BASE}/photo?maxwidth=400&photo_reference=${r.photos[0].photo_reference}&key=${KEY}`
      : null,
    ticketPrice: r.editorial_summary?.overview ?? null,
  }
}

export async function searchPlace(query: string): Promise<Place | null> {
  const url =
    `${BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(query)}&inputtype=textquery` +
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
