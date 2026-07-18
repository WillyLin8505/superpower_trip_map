import { randomUUID } from 'crypto'
import { unstable_cache } from 'next/cache'
import type { Place, PlaceType } from '@/lib/types'
import { haversineMeters } from '@/lib/haversine'
import { placeShortDescription } from '@/lib/utils/placeShortDescription'

type OpenPoiSource = 'overture' | 'osm' | 'wikidata' | 'user'
const FREE_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 30
const FREE_IMAGE_FETCH_TIMEOUT_MS = 4000

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

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  return metadataStrings(metadata, key)[0] ?? null
}

function metadataStrings(metadata: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = metadata?.[key]
  if (typeof value === 'string') return cleanText(value) ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value.map(cleanText).filter((text): text is string => text !== null)
}

function commonsFileUrl(value: string): string | null {
  const withoutPrefix = value.replace(/^File:/i, '').trim()
  if (!withoutPrefix || /^Category:/i.test(withoutPrefix)) return null
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(withoutPrefix)}`
}

function normalizeImageUrl(value: string | null): string | null {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (/^File:/i.test(value)) return commonsFileUrl(value)
  if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(value)) return commonsFileUrl(value)
  return null
}

function imageUrlsFromMetadata(metadata: Record<string, unknown> | null | undefined): string[] {
  const candidates = [
    ...metadataStrings(metadata, 'photoUrls'),
    ...metadataStrings(metadata, 'photo_urls'),
    ...metadataStrings(metadata, 'images'),
    metadataString(metadata, 'photoUrl'),
    metadataString(metadata, 'photo_url'),
    metadataString(metadata, 'imageUrl'),
    metadataString(metadata, 'image_url'),
    metadataString(metadata, 'thumbnailUrl'),
    metadataString(metadata, 'thumbnail_url'),
    metadataString(metadata, 'image'),
    metadataString(metadata, 'image:0'),
    metadataString(metadata, 'image:1'),
    metadataString(metadata, 'wikimedia_commons'),
  ]
  return Array.from(new Set(candidates.map(normalizeImageUrl).filter((url): url is string => url !== null))).slice(0, 5)
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FREE_IMAGE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'superpower-trip-map/1.0 (free POI image metadata)',
      },
      signal: controller.signal,
      next: { revalidate: FREE_IMAGE_TTL_SECONDS },
    } as RequestInit & { next: { revalidate: number } })
    if (!response.ok) throw new Error(`free_image_http_${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function cachedFreeImage<T>(keyParts: string[], fetcher: () => Promise<T>): Promise<T> {
  return unstable_cache(fetcher, ['free-poi-image', ...keyParts], { revalidate: FREE_IMAGE_TTL_SECONDS })()
}

function wikidataIdFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadataString(metadata, 'wikidata')
  return value?.match(/\bQ\d+\b/i)?.[0].toUpperCase() ?? null
}

interface WikidataEntityResponse {
  entities?: Record<string, {
    claims?: {
      P18?: Array<{
        mainsnak?: {
          datavalue?: {
            value?: unknown
          }
        }
      }>
    }
  }>
}

async function wikidataImageUrl(qid: string): Promise<string | null> {
  return cachedFreeImage(['wikidata', qid], async () => {
    const data = await fetchJsonWithTimeout(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`) as WikidataEntityResponse
    const fileName = data.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
    return typeof fileName === 'string' ? commonsFileUrl(fileName) : null
  })
}

function wikipediaTagFromMetadata(metadata: Record<string, unknown> | null | undefined): { lang: string; title: string } | null {
  const value = metadataString(metadata, 'wikipedia')
  const match = value?.match(/^([a-z][a-z-]{1,11}):(.+)$/i)
  const title = cleanText(match?.[2])
  if (!match || !title) return null
  return { lang: match[1].toLowerCase(), title }
}

interface WikipediaSummaryResponse {
  thumbnail?: { source?: unknown }
  originalimage?: { source?: unknown }
}

async function wikipediaImageUrl(lang: string, title: string): Promise<string | null> {
  return cachedFreeImage(['wikipedia', lang, title], async () => {
    const data = await fetchJsonWithTimeout(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`) as WikipediaSummaryResponse
    return normalizeImageUrl(cleanText(data.originalimage?.source) ?? cleanText(data.thumbnail?.source))
  })
}

async function freeImageUrlsFromMetadata(metadata: Record<string, unknown> | null | undefined): Promise<string[]> {
  const directUrls = imageUrlsFromMetadata(metadata)
  if (directUrls.length > 0) return directUrls

  const resolvers: Array<Promise<string | null>> = []
  const qid = wikidataIdFromMetadata(metadata)
  if (qid) resolvers.push(wikidataImageUrl(qid))
  const wikipedia = wikipediaTagFromMetadata(metadata)
  if (wikipedia) resolvers.push(wikipediaImageUrl(wikipedia.lang, wikipedia.title))

  if (resolvers.length === 0) return []

  const settled = await Promise.allSettled(resolvers)
  const rejected = settled.find((result) => result.status === 'rejected')
  if (rejected) {
    console.error('[open-poi-image] failed to resolve free image metadata', {
      error: rejected.reason instanceof Error ? rejected.reason.message : 'unknown',
    })
  }
  return Array.from(new Set(settled
    .filter((result): result is PromiseFulfilledResult<string | null> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((url): url is string => url !== null)))
    .slice(0, 5)
}

export function mapOpenPoiRowToPlace(row: OpenPoiRow): OpenPoiPlace {
  const description = cleanText(row.metadata?.description) ?? placeShortDescription(row.category)
  const zhName = cleanText(row.name_zh)
  const localName = cleanText(row.name_local)
  const primaryName = cleanText(row.name_primary) ?? row.source_place_id
  const photoUrls = imageUrlsFromMetadata(row.metadata)
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
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    description,
    source: row.source,
    sourceLabel: 'Open POI',
  }
}

export async function mapOpenPoiRowToPlaceWithFreeImages(row: OpenPoiRow): Promise<OpenPoiPlace> {
  const place = mapOpenPoiRowToPlace(row)
  if ((place.photoUrls?.length ?? 0) > 0 || place.photoUrl) return place

  const photoUrls = await freeImageUrlsFromMetadata(row.metadata)
  if (photoUrls.length === 0) return place

  return {
    ...place,
    photoUrl: photoUrls[0],
    photoUrls,
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

  const rankedRows = (data as OpenPoiRow[])
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
  return Promise.all(rankedRows.map(({ row }) => mapOpenPoiRowToPlaceWithFreeImages(row)))
}
