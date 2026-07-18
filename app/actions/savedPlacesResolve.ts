'use server'
import type { PlaceType } from '@/lib/types'
import { googleMapsFetchOptions } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { readCachedPlaceId, writeCachedPlaceId } from '@/lib/placeIdCache'
import { classifyPlaceType } from '@/lib/takeout/classify'

const KEY = process.env.GOOGLE_MAPS_API_KEY!
const BASE = 'https://maps.googleapis.com/maps/api/place'
// Legacy Place Details `fields` Basic-category token is `type` (SINGULAR); the response
// still returns a `types` ARRAY. Basic tier is the cheap tier (no Atmosphere/photos).
// Confirmed against Google's legacy "Place Data Fields" docs. skuHint below is the app's
// internal cost label (New-API-style names), consistent with how places.ts labels its
// heavier legacy details call `place_details_pro`.
const ESSENTIALS_FIELDS = ['place_id', 'name', 'geometry', 'formatted_address', 'type'].join(',')

// Not exported: a `'use server'` module may only export async functions (Next build
// rule). Nothing outside needs the name — callers infer it structurally.
interface ResolvedStub {
  placeId: string
  name: string
  type: PlaceType
  lat: number
  lng: number
  address: string
}

// Returns the candidate id WITHOUT writing the cache — the cache is written only after
// Details confirms the id resolves (see resolvePlaceEssentials), mirroring searchPlace.
async function findPlaceId(
  title: string,
  coords?: { lat: number; lng: number },
): Promise<{ placeId: string; fromCache: boolean } | null> {
  const cached = await readCachedPlaceId(title)
  if (cached) return { placeId: cached, fromCache: true }
  const params = new URLSearchParams({ input: title, inputtype: 'textquery', fields: 'place_id', key: KEY })
  if (coords) params.set('locationbias', `point:${coords.lat},${coords.lng}`)
  const res = await trackedApiFetch(`${BASE}/findplacefromtext/json?${params.toString()}`, googleMapsFetchOptions(), {
    provider: 'google_maps', endpoint: 'find_place_from_text', skuHint: 'find_place_from_text_id_only',
  })
  const data = await res.json()
  const placeId = data.candidates?.[0]?.place_id
  return placeId ? { placeId, fromCache: false } : null
}

export async function resolvePlaceEssentials(
  title: string,
  coords?: { lat: number; lng: number },
): Promise<ResolvedStub | null> {
  const found = await findPlaceId(title, coords)
  if (!found) return null
  const params = new URLSearchParams({ place_id: found.placeId, fields: ESSENTIALS_FIELDS, key: KEY, language: 'zh-TW' })
  const res = await trackedApiFetch(`${BASE}/details/json?${params.toString()}`, googleMapsFetchOptions(), {
    provider: 'google_maps', endpoint: 'place_details', skuHint: 'place_details_essentials',
  })
  const data = await res.json()
  const r = data.result
  // Cache the title→place_id mapping ONLY after Details confirms it resolves — never
  // poison place_id_cache on a bad candidate or a non-OK / geometry-less response.
  if (!r || data.status !== 'OK' || !r.geometry?.location) return null
  if (!found.fromCache) await writeCachedPlaceId(title, undefined, found.placeId)
  return {
    placeId: r.place_id ?? found.placeId,
    name: (r.name ?? title).trim(),
    type: classifyPlaceType(r.types ?? []),   // response field is `types` (array)
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    address: r.formatted_address ?? '',
  }
}
