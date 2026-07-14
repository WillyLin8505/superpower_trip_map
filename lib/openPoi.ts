import { randomUUID } from 'crypto'
import type { Place, PlaceType } from '@/lib/types'
import { haversineMeters } from '@/lib/haversine'
import { placeShortDescription } from '@/lib/utils/placeShortDescription'

export type OpenPoiSource = 'overture' | 'osm' | 'wikidata' | 'user'

export interface OpenPoiRow {
  source: OpenPoiSource
  source_place_id: string
  name_primary: string
  name_zh?: string | null
  name_local?: string | null
  lat: number
  lng: number
  category: PlaceType
  confidence?: number | null
  metadata?: Record<string, unknown> | null
}

export type OpenPoiPlace = Place & {
  source: OpenPoiSource
  sourceLabel: 'Open POI'
}

function hasSupabaseAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function isMissingPoiTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function mapOpenPoiRowToPlace(row: OpenPoiRow): OpenPoiPlace {
  const description = cleanText(row.metadata?.description) ?? placeShortDescription(row.category)
  const zhName = cleanText(row.name_zh)
  const localName = cleanText(row.name_local)
  const primaryName = cleanText(row.name_primary) ?? row.source_place_id
  return {
    id: randomUUID(),
    placeId: `${row.source}:${row.source_place_id}`,
    name: zhName ?? primaryName,
    localizedName: {
      zhTw: zhName,
      original: localName ?? primaryName,
    },
    type: row.category,
    lat: row.lat,
    lng: row.lng,
    address: '',
    openingHours: null,
    rating: null,
    photoUrl: null,
    photoUrls: [],
    description,
    source: row.source,
    sourceLabel: 'Open POI',
  }
}

function boundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320
  const lngDelta = radiusMeters / (111_320 * Math.max(Math.cos((lat * Math.PI) / 180), 0.1))
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  }
}

export async function openPoiSearch(
  lat: number,
  lng: number,
  category: 'attraction' | 'restaurant' | 'dessert',
  limit = 5,
  radiusMeters = 4000
): Promise<OpenPoiPlace[]> {
  if (!hasSupabaseAdminEnv()) return []

  const { minLat, maxLat, minLng, maxLng } = boundingBox(lat, lng, radiusMeters)
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const { data, error } = await createAdminClient()
    .from('poi_places')
    .select('source,source_place_id,name_primary,name_zh,name_local,lat,lng,category,confidence,metadata')
    .eq('category', category)
    .gte('lat', minLat)
    .lte('lat', maxLat)
    .gte('lng', minLng)
    .lte('lng', maxLng)
    .limit(Math.max(limit * 4, limit))

  if (isMissingPoiTable(error) || error || !Array.isArray(data)) return []

  return (data as OpenPoiRow[])
    .map((row) => ({
      row,
      distance: haversineMeters({ lat, lng }, { lat: row.lat, lng: row.lng }),
    }))
    .filter(({ distance }) => distance <= radiusMeters)
    .sort((a, b) => {
      const confidenceA = a.row.confidence ?? 0
      const confidenceB = b.row.confidence ?? 0
      return a.distance - b.distance || confidenceB - confidenceA
    })
    .slice(0, limit)
    .map(({ row }) => mapOpenPoiRowToPlace(row))
}
