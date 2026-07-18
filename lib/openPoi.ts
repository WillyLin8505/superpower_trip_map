import { randomUUID } from 'crypto'
import { unstable_cache } from 'next/cache'
import type { Place, PlaceType } from '@/lib/types'
import { haversineMeters } from '@/lib/haversine'
import { placeShortDescription } from '@/lib/utils/placeShortDescription'
import { trackedApiFetch } from '@/lib/apiUsageEvents'

type OpenPoiSource = 'overture' | 'osm' | 'wikidata' | 'user'
type FreeImageSource = 'metadata' | 'wikimedia_commons' | 'wikidata' | 'wikipedia' | 'openverse'
const FREE_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 30
const FREE_IMAGE_LOOKUP_VERSION = 1
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

interface FreeImageResult {
  photoUrls: string[]
  source: FreeImageSource
  pageUrl?: string | null
  license?: string | null
  attribution?: string | null
  generic?: boolean
}

interface FreeImageLookupOutcome {
  result: FreeImageResult | null
  cacheableMiss: boolean
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

function cleanHtmlText(value: unknown): string | null {
  return cleanText(value)
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
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
  if (/^https?:\/\//i.test(value)) return isKnownNonEmbeddableImageUrl(value) ? null : value
  if (/^File:/i.test(value)) return commonsFileUrl(value)
  if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(value)) return commonsFileUrl(value)
  return null
}

function isKnownNonEmbeddableImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return ['photos.app.goo.gl', 'photos.google.com'].includes(url.hostname.toLowerCase())
  } catch {
    return false
  }
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

function directImageResultFromMetadata(metadata: Record<string, unknown> | null | undefined): FreeImageResult | null {
  const photoUrls = imageUrlsFromMetadata(metadata)
  return photoUrls.length > 0 ? { photoUrls, source: 'metadata' } : null
}

async function fetchJsonWithTimeout(
  url: string,
  usage: { provider: string; endpoint: string; skuHint: string; metadata?: Record<string, unknown> }
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FREE_IMAGE_FETCH_TIMEOUT_MS)
  try {
    const response = await trackedApiFetch(url, {
      headers: {
        'User-Agent': 'superpower-trip-map/1.0 (free POI image metadata)',
      },
      signal: controller.signal,
      next: { revalidate: FREE_IMAGE_TTL_SECONDS },
    } as RequestInit & { next: { revalidate: number } }, {
      provider: usage.provider,
      endpoint: usage.endpoint,
      skuHint: usage.skuHint,
      metadata: usage.metadata,
    })
    if (!response.ok) throw new Error(`free_image_http_${response.status}`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

function cachedFreeImage<T>(keyParts: string[], fetcher: () => Promise<T>): Promise<T> {
  return unstable_cache(fetcher, ['free-poi-image', ...keyParts], { revalidate: FREE_IMAGE_TTL_SECONDS })()
}

function freeImageCache(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const value = metadata?.free_image
  return isRecord(value) ? value : null
}

function hasRecentNotFoundImageCache(metadata: Record<string, unknown> | null | undefined): boolean {
  const cache = freeImageCache(metadata)
  if (cache?.status !== 'not_found' || cache.version !== FREE_IMAGE_LOOKUP_VERSION) return false
  const fetchedAt = typeof cache.fetchedAt === 'string' ? Date.parse(cache.fetchedAt) : NaN
  if (!Number.isFinite(fetchedAt)) return false
  return Date.now() - fetchedAt < FREE_IMAGE_TTL_SECONDS * 1000
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

async function wikidataImageResult(qid: string): Promise<FreeImageResult | null> {
  return cachedFreeImage(['wikidata', qid], async () => {
    const data = await fetchJsonWithTimeout(
      `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`,
      {
        provider: 'wikimedia',
        endpoint: 'wikidata_entity',
        skuHint: 'wikimedia_free',
        metadata: { qid },
      },
    ) as WikidataEntityResponse
    const fileName = data.entities?.[qid]?.claims?.P18?.[0]?.mainsnak?.datavalue?.value
    const url = typeof fileName === 'string' ? commonsFileUrl(fileName) : null
    return url ? { photoUrls: [url], source: 'wikidata', pageUrl: `https://www.wikidata.org/wiki/${qid}` } : null
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

async function wikipediaImageResult(lang: string, title: string): Promise<FreeImageResult | null> {
  return cachedFreeImage(['wikipedia', lang, title], async () => {
    const data = await fetchJsonWithTimeout(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
      {
        provider: 'wikipedia',
        endpoint: 'page_summary',
        skuHint: 'wikipedia_free',
        metadata: { lang, title },
      },
    ) as WikipediaSummaryResponse
    const url = normalizeImageUrl(cleanText(data.originalimage?.source) ?? cleanText(data.thumbnail?.source))
    return url ? { photoUrls: [url], source: 'wikipedia', pageUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` } : null
  })
}

interface CommonsPage {
  title?: unknown
  imageinfo?: Array<{
    url?: unknown
    thumburl?: unknown
    mime?: unknown
    extmetadata?: Record<string, { value?: unknown }>
  }>
}

interface CommonsQueryResponse {
  query?: {
    pages?: Record<string, CommonsPage>
  }
}

function commonsCategoryFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadataString(metadata, 'wikimedia_commons')
  if (!value || !/^Category:/i.test(value.trim())) return null
  return value.trim().replace(/^category:/i, 'Category:')
}

function commonsMetadataText(
  extmetadata: Record<string, { value?: unknown }> | undefined,
  key: string
): string | null {
  return cleanHtmlText(extmetadata?.[key]?.value)
}

async function wikimediaCommonsCategoryImageResult(category: string): Promise<FreeImageResult | null> {
  return cachedFreeImage(['wikimedia-commons-category', category], async () => {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: category,
      gcmtype: 'file',
      gcmlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '900',
      format: 'json',
      origin: '*',
    })
    const data = await fetchJsonWithTimeout(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      provider: 'wikimedia',
      endpoint: 'commons_category_images',
      skuHint: 'wikimedia_free',
      metadata: { category },
    }) as CommonsQueryResponse
    const pages = Object.values(data.query?.pages ?? {})
    for (const page of pages) {
      const imageInfo = page.imageinfo?.find((info) =>
        typeof info.mime === 'string' && info.mime.startsWith('image/')
      ) ?? page.imageinfo?.[0]
      const url = normalizeImageUrl(cleanText(imageInfo?.thumburl) ?? cleanText(imageInfo?.url))
      if (!url) continue
      const title = cleanText(page.title)
      return {
        photoUrls: [url],
        source: 'wikimedia_commons',
        pageUrl: title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null,
        license: commonsMetadataText(imageInfo?.extmetadata, 'LicenseShortName'),
        attribution: commonsMetadataText(imageInfo?.extmetadata, 'Artist'),
      }
    }
    return null
  })
}

interface OpenverseImageResult {
  title?: unknown
  url?: unknown
  thumbnail?: unknown
  foreign_landing_url?: unknown
  license?: unknown
  creator?: unknown
}

interface OpenverseImageResponse {
  results?: OpenverseImageResult[]
}

const OPENVERSE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'cafe', 'coffee', 'restaurant', 'shop', 'store',
])

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function significantSearchTokens(value: string | null): string[] {
  if (!value) return []
  return Array.from(new Set(normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !OPENVERSE_STOP_WORDS.has(token))))
}

function openverseQueryForRow(row: OpenPoiRow): string | null {
  return cleanText(row.name_local) ?? cleanText(row.name_primary) ?? cleanText(row.name_zh)
}

function openverseResultMatches(query: string, item: OpenverseImageResult): boolean {
  const tokens = significantSearchTokens(query)
  if (tokens.length === 0) return false
  const requiredTokens = tokens.slice(0, Math.min(tokens.length, 2))
  const haystack = normalizeSearchText([
    cleanText(item.title),
    cleanText(item.foreign_landing_url),
  ].filter(Boolean).join(' '))
  return requiredTokens.every((token) => haystack.includes(token))
}

async function openverseImageResult(row: OpenPoiRow): Promise<FreeImageResult | null> {
  const query = openverseQueryForRow(row)
  if (!query) return null
  return cachedFreeImage(['openverse', query], async () => {
    const params = new URLSearchParams({
      q: query,
      page_size: '10',
      license_type: 'commercial,modification',
    })
    const data = await fetchJsonWithTimeout(`https://api.openverse.org/v1/images?${params.toString()}`, {
      provider: 'openverse',
      endpoint: 'image_search',
      skuHint: 'openverse_free',
      metadata: { query, category: row.category },
    }) as OpenverseImageResponse
    const result = (data.results ?? []).find((item) =>
      openverseResultMatches(query, item) && normalizeImageUrl(cleanText(item.thumbnail) ?? cleanText(item.url))
    )
    const url = normalizeImageUrl(cleanText(result?.thumbnail) ?? cleanText(result?.url))
    if (!result || !url) return null
    return {
      photoUrls: [url],
      source: 'openverse',
      pageUrl: cleanText(result.foreign_landing_url),
      license: cleanText(result.license),
      attribution: cleanText(result.creator),
    }
  })
}

async function runImageResolver(resolver: () => Promise<FreeImageResult | null>): Promise<{
  result: FreeImageResult | null
  failed: boolean
}> {
  try {
    return { result: await resolver(), failed: false }
  } catch (error) {
    console.error('[open-poi-image] failed to resolve free image metadata', {
      error: error instanceof Error ? error.message : 'unknown',
    })
    return { result: null, failed: true }
  }
}

async function freeImageResultForRow(row: OpenPoiRow): Promise<FreeImageLookupOutcome> {
  const direct = directImageResultFromMetadata(row.metadata)
  if (direct) return { result: direct, cacheableMiss: true }

  const resolvers: Array<() => Promise<FreeImageResult | null>> = []
  const commonsCategory = commonsCategoryFromMetadata(row.metadata)
  if (commonsCategory) resolvers.push(() => wikimediaCommonsCategoryImageResult(commonsCategory))
  const qid = wikidataIdFromMetadata(row.metadata)
  if (qid) resolvers.push(() => wikidataImageResult(qid))
  const wikipedia = wikipediaTagFromMetadata(row.metadata)
  if (wikipedia) resolvers.push(() => wikipediaImageResult(wikipedia.lang, wikipedia.title))
  resolvers.push(() => openverseImageResult(row))

  let hadFailure = false
  for (const resolver of resolvers) {
    const { result, failed } = await runImageResolver(resolver)
    hadFailure = hadFailure || failed
    if (result?.photoUrls.length) return { result, cacheableMiss: true }
  }

  return { result: null, cacheableMiss: !hadFailure }
}

function buildFreeImageMetadataPatch(
  metadata: Record<string, unknown> | null | undefined,
  result: FreeImageResult | null
): Record<string, unknown> {
  const fetchedAt = new Date().toISOString()
  const base = { ...(metadata ?? {}) }
  if (!result) {
    return {
      ...base,
      free_image: {
        status: 'not_found',
        version: FREE_IMAGE_LOOKUP_VERSION,
        fetchedAt,
      },
    }
  }

  const freeImage: Record<string, unknown> = {
    status: 'found',
    version: FREE_IMAGE_LOOKUP_VERSION,
    source: result.source,
    fetchedAt,
    url: result.photoUrls[0],
    urls: result.photoUrls,
  }
  if (result.pageUrl) freeImage.pageUrl = result.pageUrl
  if (result.license) freeImage.license = result.license
  if (result.attribution) freeImage.attribution = result.attribution
  if (result.generic) freeImage.generic = true

  return {
    ...base,
    photoUrl: result.photoUrls[0],
    photoUrls: result.photoUrls,
    image_source: result.source,
    free_image: freeImage,
  }
}

async function persistOpenPoiFreeImageMetadata(row: OpenPoiRow, result: FreeImageResult | null): Promise<void> {
  if (!hasSupabaseAdminEnv()) return
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    await createAdminClient()
      .from('poi_places')
      .update({
        metadata: buildFreeImageMetadataPatch(row.metadata, result),
        updated_at: new Date().toISOString(),
      })
      .eq('source', row.source)
      .eq('source_place_id', row.source_place_id)
      .eq('category', row.category)
  } catch (error) {
    console.error('[open-poi-image] failed to persist image metadata', {
      error: error instanceof Error ? error.message : 'unknown',
    })
  }
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
  if ((place.photoUrls?.length ?? 0) > 0 || place.photoUrl) {
    await persistOpenPoiFreeImageMetadata(row, {
      photoUrls: place.photoUrls?.length ? place.photoUrls : place.photoUrl ? [place.photoUrl] : [],
      source: 'metadata',
    })
    return place
  }

  if (hasRecentNotFoundImageCache(row.metadata)) return place

  const { result, cacheableMiss } = await freeImageResultForRow(row)
  if (!result?.photoUrls.length) {
    if (cacheableMiss) await persistOpenPoiFreeImageMetadata(row, null)
    return place
  }

  await persistOpenPoiFreeImageMetadata(row, result)
  return {
    ...place,
    photoUrl: result.photoUrls[0],
    photoUrls: result.photoUrls,
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
