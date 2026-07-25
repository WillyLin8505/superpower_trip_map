import { createHash, randomUUID } from 'crypto'
import { unstable_cache } from 'next/cache'
import type { ImageSourceProvider, Place, PlaceType, Source } from '@/lib/types'
import { haversineMeters } from '@/lib/haversine'
import { placeShortDescription } from '@/lib/utils/placeShortDescription'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { compareRecommendationCandidates, isRecommendationCandidateAcceptable } from '@/lib/utils/recommendationRank'
import { getImageSources } from '@/lib/recommendationSources'

type OpenPoiSource = 'overture' | 'osm' | 'wikidata' | 'user'
type FreeImageSource = 'metadata' | 'official_website' | 'wikimedia_commons' | 'wikidata' | 'wikipedia' | 'openverse' | 'static_free'
const FREE_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 30
const FREE_IMAGE_LOOKUP_VERSION = 17
const IMAGE_SOURCE_POLICY_VERSION = 1
const FREE_IMAGE_FETCH_TIMEOUT_MS = 4000
const MAX_FREE_IMAGE_URLS = 5
const MAX_GENERIC_IMAGE_POOL_URLS = 50
const DEFAULT_IMAGE_SOURCE_PROVIDERS: ImageSourceProvider[] = [
  'official_website',
  'wikimedia_commons',
  'wikidata',
  'wikipedia',
  'openverse',
]
const DEFAULT_IMAGE_SOURCE_POLICY_SIGNATURE =
  `default:${IMAGE_SOURCE_POLICY_VERSION}:${DEFAULT_IMAGE_SOURCE_PROVIDERS.join('>')}`

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

export interface FreeImageResult {
  photoUrls: string[]
  source: FreeImageSource
  pageUrl?: string | null
  license?: string | null
  attribution?: string | null
  confidence?: number
  generic?: boolean
  provenance?: FreeImageProvenance[]
}

export interface FreeImageProvenance {
  url: string
  source: FreeImageSource
  confidence: number
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

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.replace(/,/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function metadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = numberFromUnknown(metadata?.[key])
    if (parsed !== null) return parsed
  }
  return null
}

function addUniqueTag(tags: string[], value: unknown): void {
  const cleaned = cleanText(value)?.toLowerCase().replace(/[\s-]+/g, '_')
  if (!cleaned || tags.includes(cleaned)) return
  tags.push(cleaned)
}

function categoryTagsFromOpenPoiRow(row: OpenPoiRow): string[] {
  const tags: string[] = []
  addUniqueTag(tags, row.category)

  const osm = row.metadata?.osm
  if (isRecord(osm)) {
    for (const key of ['amenity', 'tourism', 'shop', 'leisure', 'historic', 'religion', 'cuisine']) {
      addUniqueTag(tags, osm[key])
    }
  }

  for (const key of ['categoryTags', 'category_tags', 'types', 'google_types', 'tags']) {
    for (const tag of metadataStrings(row.metadata, key)) {
      addUniqueTag(tags, tag)
    }
  }

  return tags
}

function commonsFileUrl(value: string): string | null {
  const withoutPrefix = value.replace(/^File:/i, '').trim()
  if (!withoutPrefix || /^Category:/i.test(withoutPrefix)) return null
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(withoutPrefix)}?width=900`
}

function commonsFileUrlFromWikimediaUpload(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.hostname.toLowerCase() !== 'upload.wikimedia.org') return null
    if (url.pathname.includes('/thumb/')) return value
    const match = url.pathname.match(/^\/wikipedia\/commons\/([^/]+)\/([^/]+)\/(.+)$/)
    if (!match) return null
    const [, , , filePath] = match
    const fileName = filePath.split('/').pop()
    if (!fileName) return null
    return commonsFileUrl(decodeURIComponent(fileName))
  } catch {
    return null
  }
}

function normalizeImageUrl(value: string | null): string | null {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) {
    if (isKnownNonEmbeddableImageUrl(value)) return null
    return commonsFileUrlFromWikimediaUpload(value) ?? value
  }
  if (/^File:/i.test(value)) return commonsFileUrl(value)
  if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(value)) return commonsFileUrl(value)
  return null
}

function wikimediaImageFileKey(value: string): string | null {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    let fileName: string | null = null
    if (hostname === 'commons.wikimedia.org') {
      const match = url.pathname.match(/^\/wiki\/Special:FilePath\/(.+)$/i)
      fileName = match?.[1] ? decodeURIComponent(match[1]) : null
    } else if (hostname === 'upload.wikimedia.org') {
      const parts = url.pathname.split('/').filter(Boolean)
      const thumbIndex = parts.indexOf('thumb')
      if (parts[0] === 'wikipedia' && parts[1] === 'commons') {
        fileName = thumbIndex >= 0
          ? parts[thumbIndex + 3] ?? null
          : parts[4] ?? null
      }
      fileName = fileName ? decodeURIComponent(fileName) : null
    }
    return fileName
      ? `wikimedia:${fileName.replace(/ /g, '_').toLowerCase()}`
      : null
  } catch {
    return null
  }
}

function imageDedupKey(value: string): string {
  return wikimediaImageFileKey(value) ?? value
}

function uniqueImageUrls(values: string[]): string[] {
  const byImage = new Map<string, string>()
  for (const value of values) {
    const key = imageDedupKey(value)
    if (!byImage.has(key)) byImage.set(key, value)
  }
  return Array.from(byImage.values())
}

function isKnownNonEmbeddableImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (['photos.app.goo.gl', 'photos.google.com'].includes(hostname)) return true
    return hostname === 'api.openverse.org' && /^\/v1\/images\/[^/]+\/thumb\/?$/i.test(url.pathname)
  } catch {
    return false
  }
}

function isCurrentFreeImageCache(
  cache: Record<string, unknown> | null,
  policySignature: string | null | undefined,
): boolean {
  return Boolean(
    cache &&
    cache.version === FREE_IMAGE_LOOKUP_VERSION &&
    cache.policyVersion === IMAGE_SOURCE_POLICY_VERSION &&
    typeof policySignature === 'string' &&
    cache.policySignature === policySignature
  )
}

function imageUrlsFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  policySignature?: string | null
): string[] {
  const genericImageUrls = genericFreeImageUrlSet(metadata)
  const cache = freeImageCache(metadata)
  const useCachedFreeImageUrls = isCurrentFreeImageCache(cache, policySignature)
  const useRootPhotoFields = !cache || useCachedFreeImageUrls
  const candidates = [
    ...(useRootPhotoFields ? metadataStrings(metadata, 'photoUrls') : []),
    ...(useRootPhotoFields ? metadataStrings(metadata, 'photo_urls') : []),
    ...metadataStrings(metadata, 'images'),
    ...(useRootPhotoFields ? [metadataString(metadata, 'photoUrl')] : []),
    ...(useRootPhotoFields ? [metadataString(metadata, 'photo_url')] : []),
    metadataString(metadata, 'imageUrl'),
    metadataString(metadata, 'image_url'),
    metadataString(metadata, 'thumbnailUrl'),
    metadataString(metadata, 'thumbnail_url'),
    metadataString(metadata, 'image'),
    metadataString(metadata, 'image:0'),
    metadataString(metadata, 'image:1'),
    metadataString(metadata, 'wikimedia_commons'),
  ]
  return uniqueImageUrls(candidates
    .map(normalizeImageUrl)
    .filter((url): url is string => url !== null && !genericImageUrls.has(url)))
    .slice(0, 5)
}

function genericFreeImageUrlSet(metadata: Record<string, unknown> | null | undefined): Set<string> {
  const cache = freeImageCache(metadata)
  if (cache?.status !== 'found' || cache.generic !== true) return new Set()
  return new Set([
    ...metadataStrings(cache, 'urls'),
    metadataString(cache, 'url'),
  ].map(normalizeImageUrl).filter((url): url is string => url !== null))
}

function directImageResultFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  policySignature?: string | null
): FreeImageResult | null {
  const photoUrls = imageUrlsFromMetadata(metadata, policySignature)
  return photoUrls.length > 0 ? imageResultWithProvenance({ photoUrls, source: 'metadata' }) : null
}

function confidenceForImageSource(source: FreeImageSource, generic = false): number {
  if (generic) return 30
  switch (source) {
    case 'official_website':
      return 95
    case 'metadata':
      return 92
    case 'wikidata':
      return 90
    case 'wikipedia':
      return 86
    case 'wikimedia_commons':
      return 82
    case 'openverse':
      return 72
    case 'static_free':
      return 30
  }
}

function provenanceForImageResult(result: FreeImageResult): FreeImageProvenance[] {
  if (result.provenance?.length) {
    return result.provenance
      .filter((item) => result.photoUrls.includes(item.url))
      .slice(0, MAX_FREE_IMAGE_URLS)
  }

  const confidence = result.confidence ?? confidenceForImageSource(result.source, result.generic === true)
  return result.photoUrls.slice(0, MAX_FREE_IMAGE_URLS).map((url) => ({
    url,
    source: result.source,
    confidence,
    pageUrl: result.pageUrl,
    license: result.license,
    attribution: result.attribution,
    generic: result.generic,
  }))
}

function uniqueImageProvenance(items: FreeImageProvenance[]): FreeImageProvenance[] {
  const byImage = new Map<string, FreeImageProvenance>()
  for (const item of items) {
    const key = imageDedupKey(item.url)
    if (!byImage.has(key)) byImage.set(key, item)
  }
  return Array.from(byImage.values())
}

function imageResultWithProvenance(result: FreeImageResult): FreeImageResult {
  const provenance = uniqueImageProvenance(provenanceForImageResult(result)).slice(0, MAX_FREE_IMAGE_URLS)
  const confidence = result.confidence ?? Math.max(...provenance.map((item) => item.confidence))
  return {
    ...result,
    photoUrls: provenance.map((item) => item.url),
    confidence,
    provenance,
  }
}

function mergeFreeImageResults(current: FreeImageResult | null, next: FreeImageResult | null): FreeImageResult | null {
  if (!next?.photoUrls.length) return current
  if (!current?.photoUrls.length) {
    return imageResultWithProvenance({
      ...next,
      photoUrls: next.photoUrls.slice(0, MAX_FREE_IMAGE_URLS),
    })
  }

  const provenance = uniqueImageProvenance([
    ...provenanceForImageResult(current),
    ...provenanceForImageResult(next),
  ]).slice(0, MAX_FREE_IMAGE_URLS)
  const photoUrls = provenance.map((item) => item.url)

  return {
    ...current,
    photoUrls,
    provenance,
    confidence: Math.max(...provenance.map((item) => item.confidence)),
    generic: current.generic === true || next.generic === true,
  }
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

async function fetchTextWithTimeout(
  url: string,
  usage: { provider: string; endpoint: string; skuHint: string; metadata?: Record<string, unknown> }
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FREE_IMAGE_FETCH_TIMEOUT_MS)
  try {
    const response = await trackedApiFetch(url, {
      headers: {
        'User-Agent': 'superpower-trip-map/1.0 (official website image metadata)',
        'Accept': 'text/html,application/xhtml+xml',
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
    const contentType = response.headers?.get?.('content-type')?.toLowerCase() ?? ''
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error('official_website_not_html')
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function cachedFreeImage<T>(keyParts: string[], fetcher: () => Promise<T>): Promise<T> {
  return unstable_cache(fetcher, ['free-poi-image', String(FREE_IMAGE_LOOKUP_VERSION), ...keyParts], { revalidate: FREE_IMAGE_TTL_SECONDS })()
}

function freeImageCache(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const value = metadata?.free_image
  return isRecord(value) ? value : null
}

function hasRecentNotFoundImageCache(
  metadata: Record<string, unknown> | null | undefined,
  policySignature: string
): boolean {
  const cache = freeImageCache(metadata)
  if (cache?.status !== 'not_found' || !isCurrentFreeImageCache(cache, policySignature)) return false
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
      P856?: Array<{
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

interface WikipediaSearchResponse {
  query?: {
    search?: Array<{ title?: unknown }>
  }
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
    const url = normalizeImageUrl(cleanText(data.thumbnail?.source) ?? cleanText(data.originalimage?.source))
    return url ? { photoUrls: [url], source: 'wikipedia', pageUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` } : null
  })
}

function ipv4IsPrivate(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [first, second] = parts
  return first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254) ||
    first === 0
}

function safePublicHttpUrl(value: string | null | undefined, baseUrl?: string): string | null {
  const cleaned = cleanText(value)
  if (!cleaned) return null
  const withProtocol = baseUrl || /^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`
  try {
    const url = new URL(withProtocol, baseUrl)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    const hostname = url.hostname.toLowerCase()
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) return null
    if (hostname === '::1' || hostname.startsWith('[')) return null
    if (ipv4IsPrivate(hostname)) return null
    return url.href
  } catch {
    return null
  }
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function htmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*([\"'])(.*?)\\1`, 'i'))
  return match?.[2] ? decodeHtmlAttribute(match[2]) : null
}

function isLikelyContentImageUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const path = decodeURIComponent(url.pathname).toLowerCase()
    if (/\.(?:svg|ico)(?:$|\?)/i.test(path)) return false
    if (/(?:^|[-_/])(logo|favicon|icon|sprite|placeholder|noimage|no-photo|loading|avatar|marker)(?:[-_. /]|$)/i.test(path)) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function addOfficialImageUrl(urls: string[], value: string | null | undefined, pageUrl: string): void {
  const safeUrl = safePublicHttpUrl(value, pageUrl)
  const normalized = normalizeImageUrl(safeUrl)
  if (!normalized || !isLikelyContentImageUrl(normalized)) return
  if (!urls.includes(normalized)) urls.push(normalized)
}

function imageValuesFromJsonLd(value: unknown): string[] {
  if (!value) return []
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(imageValuesFromJsonLd)
  if (!isRecord(value)) return []
  const direct = imageValuesFromJsonLd(value.image)
  const url = typeof value.url === 'string' && Object.keys(value).length <= 3 ? [value.url] : []
  return [...direct, ...url]
}

function officialImageUrlsFromHtml(html: string, pageUrl: string): string[] {
  const urls: string[] = []
  const metaPattern = /<meta\b[^>]*>/gi
  for (const match of html.matchAll(metaPattern)) {
    const tag = match[0]
    const key = (htmlAttribute(tag, 'property') ?? htmlAttribute(tag, 'name') ?? htmlAttribute(tag, 'itemprop'))?.toLowerCase()
    if (!key || !['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src', 'image'].includes(key)) continue
    addOfficialImageUrl(urls, htmlAttribute(tag, 'content'), pageUrl)
    if (urls.length >= MAX_FREE_IMAGE_URLS) return urls
  }

  const jsonLdPattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of html.matchAll(jsonLdPattern)) {
    try {
      const parsed = JSON.parse(match[1].trim())
      for (const value of imageValuesFromJsonLd(parsed)) {
        addOfficialImageUrl(urls, value, pageUrl)
        if (urls.length >= MAX_FREE_IMAGE_URLS) return urls
      }
    } catch {
    }
  }

  return urls
}

function metadataWebsiteUrls(metadata: Record<string, unknown> | null | undefined): string[] {
  const candidates = [
    metadataString(metadata, 'website'),
    metadataString(metadata, 'official_website'),
    metadataString(metadata, 'officialWebsite'),
    metadataString(metadata, 'url'),
    metadataString(metadata, 'contact:website'),
  ]
  const osm = metadata?.osm
  if (isRecord(osm)) {
    candidates.push(
      cleanText(osm.website),
      cleanText(osm['contact:website']),
      cleanText(osm.url),
    )
  }
  return Array.from(new Set(candidates
    .map((url) => safePublicHttpUrl(url))
    .filter((url): url is string => url !== null)))
}

async function officialWebsiteImageResultForUrl(websiteUrl: string): Promise<FreeImageResult | null> {
  return cachedFreeImage(['official-website-image', websiteUrl], async () => {
    const html = await fetchTextWithTimeout(websiteUrl, {
      provider: 'official_website',
      endpoint: 'page_metadata_image',
      skuHint: 'official_website_free',
      metadata: { websiteUrl },
    })
    const photoUrls = officialImageUrlsFromHtml(html, websiteUrl).slice(0, MAX_FREE_IMAGE_URLS)
    if (photoUrls.length === 0) return null
    return imageResultWithProvenance({
      photoUrls,
      source: 'official_website',
      pageUrl: websiteUrl,
      confidence: confidenceForImageSource('official_website'),
    })
  })
}

async function officialWebsiteImageResult(row: OpenPoiRow): Promise<FreeImageResult | null> {
  let merged: FreeImageResult | null = null
  for (const websiteUrl of metadataWebsiteUrls(row.metadata)) {
    const result = await officialWebsiteImageResultForUrl(websiteUrl)
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return merged
  }
  return merged
}

async function wikidataOfficialWebsiteUrls(qid: string): Promise<string[]> {
  return cachedFreeImage(['wikidata-official-website', qid], async () => {
    const data = await fetchJsonWithTimeout(
      `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`,
      {
        provider: 'wikimedia',
        endpoint: 'wikidata_entity_official_website',
        skuHint: 'wikimedia_free',
        metadata: { qid },
      },
    ) as WikidataEntityResponse
    return Array.from(new Set((data.entities?.[qid]?.claims?.P856 ?? [])
      .map((claim) => safePublicHttpUrl(claim.mainsnak?.datavalue?.value as string | undefined))
      .filter((url): url is string => url !== null)))
  })
}

async function wikidataOfficialWebsiteImageResult(qid: string): Promise<FreeImageResult | null> {
  let merged: FreeImageResult | null = null
  for (const websiteUrl of await wikidataOfficialWebsiteUrls(qid)) {
    const result = await officialWebsiteImageResultForUrl(websiteUrl)
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return merged
  }
  return merged
}

const WIKIPEDIA_SEARCH_LANGS = ['zh', 'ja', 'en'] as const

function containsCjk(value: string): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(value)
}

function normalizeCjkLookupText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

function cjkChars(value: string): string[] {
  return Array.from(normalizeCjkLookupText(value).match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? [])
}

function isUnsafeBroadPublicImageQuery(value: string): boolean {
  const cleanValue = cleanText(value)
  if (!cleanValue || !containsCjk(cleanValue)) return false
  if (significantSearchTokens(cleanValue).length > 0) return false
  return Array.from(new Set(cjkChars(cleanValue))).length <= 2
}

function hasStructuredImageIdentity(row: OpenPoiRow): boolean {
  return Boolean(
    wikidataIdFromMetadata(row.metadata) ||
    wikipediaTagFromMetadata(row.metadata) ||
    commonsCategoryFromMetadata(row.metadata) ||
    metadataWebsiteUrls(row.metadata).length > 0
  )
}

function isUnsafeBroadPublicImageRow(row: OpenPoiRow): boolean {
  if (hasStructuredImageIdentity(row)) return false
  return [
    row.name_local,
    row.name_primary,
    row.name_zh,
  ].some((name) => isUnsafeBroadPublicImageQuery(name ?? ''))
}

function cjkFuzzyTitleMatch(query: string, title: string): boolean {
  const queryChars = Array.from(new Set(cjkChars(query)))
  const titleChars = new Set(cjkChars(title))
  if (queryChars.length === 0 || titleChars.size === 0) return false

  const shared = queryChars.filter((char) => titleChars.has(char)).length
  const threshold = Math.max(2, Math.ceil(queryChars.length * 0.6))
  const lastQueryChar = queryChars[queryChars.length - 1]
  return shared >= threshold && titleChars.has(lastQueryChar)
}

function wikipediaTitleMatchesQuery(query: string, title: string): boolean {
  const cleanQuery = cleanText(query)
  const cleanTitle = cleanText(title)
  if (!cleanQuery || !cleanTitle) return false

  const tokens = significantSearchTokens(cleanQuery)
  if (tokens.length > 0) {
    const haystack = normalizeSearchText(cleanTitle)
    return tokens.every((token) => haystack.includes(token))
  }

  if (containsCjk(cleanQuery)) {
    const normalizedQuery = normalizeCjkLookupText(cleanQuery)
    const normalizedTitle = normalizeCjkLookupText(cleanTitle)
    return normalizedTitle.includes(normalizedQuery) ||
      normalizedQuery.includes(normalizedTitle) ||
      cjkFuzzyTitleMatch(cleanQuery, cleanTitle)
  }

  return false
}

async function wikipediaSearchTitle(lang: string, query: string): Promise<string | null> {
  return cachedFreeImage(['wikipedia-search-title', lang, query], async () => {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '5',
      format: 'json',
      origin: '*',
    })
    const data = await fetchJsonWithTimeout(`https://${lang}.wikipedia.org/w/api.php?${params.toString()}`, {
      provider: 'wikipedia',
      endpoint: 'page_search',
      skuHint: 'wikipedia_free',
      metadata: { lang, query },
    }) as WikipediaSearchResponse
    const titles = (data.query?.search ?? [])
      .map((item) => cleanText(item.title))
      .filter((title): title is string => Boolean(title))
    return titles.find((title) => wikipediaTitleMatchesQuery(query, title)) ?? null
  })
}

async function wikipediaSearchImageResultForQuery(query: string, category: PlaceType): Promise<FreeImageResult | null> {
  const cleanQuery = cleanText(query)
  if (!cleanQuery) return null
  if (isUnsafeBroadPublicImageQuery(cleanQuery)) return null

  for (const lang of WIKIPEDIA_SEARCH_LANGS) {
    const title = await wikipediaSearchTitle(lang, cleanQuery)
    if (!title) continue
    const result = mergeFreeImageResults(
      await wikipediaImageResult(lang, title),
      await wikimediaCommonsSearchImageResultForQuery(title, category)
    )
    if (result?.photoUrls.length) return result
  }

  return null
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

function commonsResultFromPages(pages: CommonsPage[]): FreeImageResult | null {
  const photoUrls: string[] = []
  let firstPageUrl: string | null = null
  let firstLicense: string | null = null
  let firstAttribution: string | null = null

  for (const page of pages) {
    const imageInfo = page.imageinfo?.find((info) =>
      typeof info.mime === 'string' && info.mime.startsWith('image/')
    )
    if (!imageInfo) continue
    const url = normalizeImageUrl(cleanText(imageInfo.thumburl) ?? cleanText(imageInfo.url))
    if (!url) continue
    const title = cleanText(page.title)
    if (!photoUrls.some((existing) => imageDedupKey(existing) === imageDedupKey(url))) photoUrls.push(url)
    firstPageUrl ??= title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}` : null
    firstLicense ??= commonsMetadataText(imageInfo.extmetadata, 'LicenseShortName')
    firstAttribution ??= commonsMetadataText(imageInfo.extmetadata, 'Artist')
    if (photoUrls.length >= MAX_FREE_IMAGE_URLS) break
  }

  return photoUrls.length > 0
    ? {
      photoUrls,
      source: 'wikimedia_commons',
      pageUrl: firstPageUrl,
      license: firstLicense,
      attribution: firstAttribution,
    }
    : null
}

function commonsPageTitleLooksEmbeddable(title: string | null): boolean {
  if (!title) return false
  return !/\.(?:pdf|djvu)(?:\b|$)/i.test(title) &&
    !/\b(?:cadal|ndl|ia|internet archive)\b/i.test(title)
}

function commonsPageTitleMatchesQuery(query: string, title: string | null): boolean {
  const cleanQuery = cleanText(query)
  const cleanTitle = cleanText(title)
  if (!cleanQuery || !cleanTitle) return false

  const fileTitle = cleanTitle
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')

  if (containsCjk(cleanQuery)) {
    const normalizedQuery = normalizeCjkLookupText(cleanQuery)
    const normalizedTitle = normalizeCjkLookupText(fileTitle)
    if (normalizedTitle.includes(normalizedQuery) || cjkFuzzyTitleMatch(cleanQuery, fileTitle)) return true
  }

  const tokens = significantSearchTokens(cleanQuery)
  if (tokens.length === 0) return false
  if (tokens.length === 1 && tokens[0].length < 5) return false

  const haystack = normalizeSearchText(fileTitle)
  const requiredTokens = tokens.slice(0, Math.min(tokens.length, 2))
  return requiredTokens.every((token) => haystack.includes(token))
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
    return commonsResultFromPages(Object.values(data.query?.pages ?? {})
      .filter((page) => commonsPageTitleLooksEmbeddable(cleanText(page.title))))
  })
}

async function wikimediaCommonsSearchImageResultForQuery(query: string, category: PlaceType): Promise<FreeImageResult | null> {
  const cleanQuery = cleanText(query)
  if (!cleanQuery) return null
  if (isUnsafeBroadPublicImageQuery(cleanQuery)) return null

  return cachedFreeImage(['wikimedia-commons-search', cleanQuery], async () => {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: cleanQuery,
      gsrnamespace: '6',
      gsrlimit: '12',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '900',
      format: 'json',
      origin: '*',
    })
    const data = await fetchJsonWithTimeout(`https://commons.wikimedia.org/w/api.php?${params.toString()}`, {
      provider: 'wikimedia',
      endpoint: 'commons_search_images',
      skuHint: 'wikimedia_free',
      metadata: { query: cleanQuery, category },
    }) as CommonsQueryResponse
    return commonsResultFromPages(Object.values(data.query?.pages ?? {})
      .filter((page) => {
        const title = cleanText(page.title)
        return commonsPageTitleLooksEmbeddable(title) && commonsPageTitleMatchesQuery(cleanQuery, title)
      }))
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
  'road',
])

const CATEGORY_FREE_IMAGE_QUERIES: Record<PlaceType, string> = {
  attraction: 'travel landmark attraction',
  restaurant: 'local restaurant food',
  dessert: 'cafe dessert cake',
  accommodation: 'hotel building',
}

const STATIC_FREE_CATEGORY_IMAGE_URLS: Record<PlaceType, string[]> = {
  attraction: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Akihabara_Electric_Town_9999_26.jpg/960px-Akihabara_Electric_Town_9999_26.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Akihabara_Electric_Town_9999_14.jpg/960px-Akihabara_Electric_Town_9999_14.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Claw_cranes_with_kawaii_stuffed_mascots_and_a_woman_playing%2C_Akihabara%2C_Chiyoda%2C_Tokyo%2C_Japan.jpg/960px-Claw_cranes_with_kawaii_stuffed_mascots_and_a_woman_playing%2C_Akihabara%2C_Chiyoda%2C_Tokyo%2C_Japan.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Akihabara_Electric_Town_9999_25.jpg/960px-Akihabara_Electric_Town_9999_25.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Akihabara_Electric_Town_9999_29.jpg/960px-Akihabara_Electric_Town_9999_29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Tokyo_Skytree_2014_%E2%85%A2.jpg/960px-Tokyo_Skytree_2014_%E2%85%A2.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Tokyo_Skytree_%28white%29.jpg/960px-Tokyo_Skytree_%28white%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Tokyo_Skytree%3B_March_2014.jpg/960px-Tokyo_Skytree%3B_March_2014.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Worm%27s-eye_view_of_Tokyo_Skytree_with_vertical_symmetry_impression%2C_a_sunny_day%2C_in_Japan.jpg/960px-Worm%27s-eye_view_of_Tokyo_Skytree_with_vertical_symmetry_impression%2C_a_sunny_day%2C_in_Japan.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Tokyo_Skytree_%2849938192996%29.jpg/960px-Tokyo_Skytree_%2849938192996%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Sensoji_2023.jpg/960px-Sensoji_2023.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Main_Hall%2C_Sens%C5%8D-ji_Temple%2C_Tokyo%2C_20240824_1104_5619.jpg/960px-Main_Hall%2C_Sens%C5%8D-ji_Temple%2C_Tokyo%2C_20240824_1104_5619.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Asakusa_shrine_2012.JPG/960px-Asakusa_shrine_2012.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Torii_of_Asakusa_Shrine_2.JPG/960px-Torii_of_Asakusa_Shrine_2.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Asakusa_-_Senso-ji_82_%2815163996964%29.jpg/960px-Asakusa_-_Senso-ji_82_%2815163996964%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Asakusa_Shrine_20150915.JPG/960px-Asakusa_Shrine_20150915.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Asakusa_shrine-1.jpg/960px-Asakusa_shrine-1.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Meiji-jingu-pathway.jpg/960px-Meiji-jingu-pathway.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Meiji_Jingu_Stadium_aerial_view.jpg/960px-Meiji_Jingu_Stadium_aerial_view.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Meiji-jing%C5%AB_grand_torii_d%27entr%C3%A9e.jpg/960px-Meiji-jing%C5%AB_grand_torii_d%27entr%C3%A9e.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Meiji-jing%C5%AB_corbeau_gros_bec.jpg/960px-Meiji-jing%C5%AB_corbeau_gros_bec.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/df/Meiji-jing%C5%AB_vin_de_Bourgogne.jpg/960px-Meiji-jing%C5%AB_vin_de_Bourgogne.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Buildings_in_Hibiya%2C_rainy_summer_evening.jpg/960px-Buildings_in_Hibiya%2C_rainy_summer_evening.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Buildings_in_Hibiya%2C_rainy_summer_evening_5.jpg/960px-Buildings_in_Hibiya%2C_rainy_summer_evening_5.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Asakusa_Rockza_Building.JPG/960px-Asakusa_Rockza_Building.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Asakusa_Rockza_2012.JPG/960px-Asakusa_Rockza_2012.JPG',
  ],
  restaurant: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Tamago_yaki_by_ayustety_in_Tokyo.jpg/960px-Tamago_yaki_by_ayustety_in_Tokyo.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/%E7%8E%89%E5%AD%90%E7%87%92_%E6%9D%BE%E9%9C%B2_%2810363166125%29.jpg/960px-%E7%8E%89%E5%AD%90%E7%87%92_%E6%9D%BE%E9%9C%B2_%2810363166125%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Tamago_yaki.JPG/960px-Tamago_yaki.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Tamago_yaki_a0.jpg/960px-Tamago_yaki_a0.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Jojoen_Yakiniku_Restaurant_01.jpg/960px-Jojoen_Yakiniku_Restaurant_01.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/%E6%95%98%E6%95%98%E8%8B%91_%2848118317297%29.jpg/960px-%E6%95%98%E6%95%98%E8%8B%91_%2848118317297%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/%E6%95%98%E6%95%98%E8%8B%91_%2848118259848%29.jpg/960px-%E6%95%98%E6%95%98%E8%8B%91_%2848118259848%29.jpg',
    'https://live.staticflickr.com/6094/6338451149_68e475632c_b.jpg',
    'https://live.staticflickr.com/7312/9755629992_689d39b423_b.jpg',
    'https://live.staticflickr.com/4025/4718509513_2a9a29792e_b.jpg',
    'https://live.staticflickr.com/24/39037399_af847ff548_b.jpg',
    'https://live.staticflickr.com/3704/8966869716_0e7d40eddd_b.jpg',
    'https://live.staticflickr.com/7437/8965680493_f0c01704fc_b.jpg',
    'https://live.staticflickr.com/7356/8966870764_6519f2129b_b.jpg',
  ],
  dessert: [
    'https://commons.wikimedia.org/wiki/Special:FilePath/Gaufrette_of_Tokyo_Fugetsudo.jpg?width=900',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Kobe-Fugetsudo_chocolates.jpg/960px-Kobe-Fugetsudo_chocolates.jpg',
    'https://live.staticflickr.com/2143/2239975118_4562aa3ba6.jpg',
    'https://live.staticflickr.com/8493/8445136988_7784c0a0db_b.jpg',
    'https://live.staticflickr.com/4058/4254829770_09e4731e7a_b.jpg',
    'https://live.staticflickr.com/3754/14294093741_7b2b7d49d0_b.jpg',
    'https://live.staticflickr.com/3332/3537630156_786d6d0fc1_b.jpg',
    'https://live.staticflickr.com/6094/6338451149_68e475632c_b.jpg',
    'https://live.staticflickr.com/7312/9755629992_689d39b423_b.jpg',
    'https://live.staticflickr.com/4025/4718509513_2a9a29792e_b.jpg',
    'https://live.staticflickr.com/8034/8014601203_2c0c68afac.jpg',
    'https://live.staticflickr.com/3880/15006539841_4701798c1c_b.jpg',
    'https://commons.wikimedia.org/wiki/Special:FilePath/HK_HKCL_D%C3%A9lifrance.JPG?width=900',
    'https://live.staticflickr.com/24/39037399_af847ff548_b.jpg',
    'https://live.staticflickr.com/3704/8966869716_0e7d40eddd_b.jpg',
    'https://live.staticflickr.com/7437/8965680493_f0c01704fc_b.jpg',
    'https://live.staticflickr.com/7356/8966870764_6519f2129b_b.jpg',
    'https://live.staticflickr.com/65535/54155304956_e0ffecdc5a_b.jpg',
    'https://live.staticflickr.com/65535/54155768780_1e3c0c537a_b.jpg',
    'https://live.staticflickr.com/65535/54155628129_eb361bb4fb_b.jpg',
    'https://live.staticflickr.com/65535/54155627704_718d9c6799_b.jpg',
    'https://live.staticflickr.com/65535/54155305091_3005c16ae5_b.jpg',
  ],
  accommodation: [
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Buildings_in_Hibiya%2C_rainy_summer_evening.jpg/960px-Buildings_in_Hibiya%2C_rainy_summer_evening.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Buildings_in_Hibiya%2C_rainy_summer_evening_5.jpg/960px-Buildings_in_Hibiya%2C_rainy_summer_evening_5.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Tokyo_Skytree_2014_%E2%85%A2.jpg/960px-Tokyo_Skytree_2014_%E2%85%A2.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Tokyo_Skytree_%28white%29.jpg/960px-Tokyo_Skytree_%28white%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Akihabara_Electric_Town_9999_26.jpg/960px-Akihabara_Electric_Town_9999_26.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Akihabara_Electric_Town_9999_14.jpg/960px-Akihabara_Electric_Town_9999_14.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Akihabara_Electric_Town_9999_25.jpg/960px-Akihabara_Electric_Town_9999_25.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/Sensoji_2023.jpg/960px-Sensoji_2023.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Meiji-jing%C5%AB_grand_torii_d%27entr%C3%A9e.jpg/960px-Meiji-jing%C5%AB_grand_torii_d%27entr%C3%A9e.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Asakusa_Rockza_Building.JPG/960px-Asakusa_Rockza_Building.JPG',
  ],
}

function stableHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

function seededPhotoUrls(photoUrls: string[], seed: string, limit = MAX_FREE_IMAGE_URLS): string[] {
  const uniquePhotoUrls = Array.from(new Set(photoUrls.filter(Boolean)))
  if (uniquePhotoUrls.length <= limit) return uniquePhotoUrls.slice(0, limit)
  let state = stableHash(seed) || 1
  const shuffled = [...uniquePhotoUrls]
  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled.slice(0, limit)
}

function genericImageSeedForRow(row: OpenPoiRow): string {
  return [
    row.source,
    row.source_place_id,
    String(row.lat),
    String(row.lng),
    row.name_primary,
    row.name_local,
    row.name_zh,
    ...metadataStrings(row.metadata, 'image_search_aliases'),
    ...metadataStrings(row.metadata, 'search_aliases'),
    ...metadataStrings(row.metadata, 'aliases'),
  ].map((value) => cleanText(value)).filter(Boolean).join('|')
}

function staticCategoryImageResult(category: PlaceType, seed: string): FreeImageResult | null {
  const photoUrls = seededPhotoUrls(STATIC_FREE_CATEGORY_IMAGE_URLS[category], seed)
  if (photoUrls.length === 0) return null
  return {
    photoUrls,
    source: 'static_free',
    generic: true,
  }
}

interface KnownFreeImageEntity {
  aliases: string[]
  wikidata?: string
  wikipedia?: { lang: string; title: string }
  commonsCategory?: string
}

const KNOWN_FREE_IMAGE_ENTITIES: KnownFreeImageEntity[] = [
  {
    aliases: [
      'Hanoi Train Street',
      'Train Street Hanoi',
      '火車街',
      '河內火車街',
      'Ngõ 224 Lê Duẩn',
      'Ngo 224 Le Duan',
    ],
    wikidata: 'Q85788921',
    wikipedia: { lang: 'en', title: 'Hanoi Train Street' },
    commonsCategory: 'Category:Hanoi Train Street',
  },
  {
    aliases: [
      '淺草寺',
      '浅草寺',
      'Sensō-ji',
      'Senso-ji',
      'Sensoji',
      'Sensō-ji Temple',
      'Sensoji Temple',
      'Asakusa Kannon',
      'Asakusa Temple',
    ],
    wikidata: 'Q615183',
    wikipedia: { lang: 'en', title: 'Sensō-ji' },
    commonsCategory: 'Category:Sensoji',
  },
]

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'd')
    .toLowerCase()
}

function normalizeAliasLookupText(value: string): string {
  return normalizeSearchText(value)
    .replace(/[^\u4e00-\u9fffa-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function addUniqueText(values: string[], value: string | null | undefined): void {
  const cleaned = cleanText(value)?.replace(/\bcroissent\b/gi, 'croissant')
  if (!cleaned) return
  if (!values.some((existing) => normalizeAliasLookupText(existing) === normalizeAliasLookupText(cleaned))) {
    values.push(cleaned)
  }
}

function knownFreeImageEntityForText(value: string | null | undefined): KnownFreeImageEntity | null {
  const normalized = value ? normalizeAliasLookupText(value) : ''
  if (!normalized) return null
  return KNOWN_FREE_IMAGE_ENTITIES.find((entity) =>
    entity.aliases.some((alias) => {
      const normalizedAlias = normalizeAliasLookupText(alias)
      if (normalized === normalizedAlias) return true
      const hasHan = /[\u4e00-\u9fff]/.test(normalizedAlias)
      if (hasHan && normalizedAlias.length >= 3) return normalized.includes(normalizedAlias)
      if (normalizedAlias.length >= 10 && normalized.includes(normalizedAlias)) return true
      return normalized.length >= 10 && normalizedAlias.includes(normalized)
    })
  ) ?? null
}

function knownFreeImageEntityForAliases(aliases: string[]): KnownFreeImageEntity | null {
  for (const alias of aliases) {
    const entity = knownFreeImageEntityForText(alias)
    if (entity) return entity
  }
  return null
}

function significantSearchTokens(value: string | null): string[] {
  if (!value) return []
  return Array.from(new Set(normalizeSearchText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !OPENVERSE_STOP_WORDS.has(token))))
}

function imageSearchAliasesForRow(row: OpenPoiRow): string[] {
  const aliases: string[] = []
  for (const alias of [
    ...metadataStrings(row.metadata, 'image_search_aliases'),
    ...metadataStrings(row.metadata, 'search_aliases'),
    ...metadataStrings(row.metadata, 'aliases'),
  ]) {
    addUniqueText(aliases, alias)
  }
  addUniqueText(aliases, row.name_local)
  addUniqueText(aliases, row.name_primary)
  addUniqueText(aliases, row.name_zh)

  const entity = knownFreeImageEntityForAliases(aliases)
  if (entity) {
    const entityAliases: string[] = []
    entity.aliases.forEach((alias) => addUniqueText(entityAliases, alias))
    aliases.forEach((alias) => addUniqueText(entityAliases, alias))
    return entityAliases
  }

  return aliases
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

function openverseEmbeddableUrl(item: OpenverseImageResult): string | null {
  const directUrl = normalizeImageUrl(cleanText(item.url))
  if (directUrl) {
    try {
      const pathname = new URL(directUrl).pathname
      if (/\.(?:avif|gif|jpe?g|png|webp)$/i.test(pathname)) return directUrl
    } catch {
    }
  }
  return normalizeImageUrl(cleanText(item.thumbnail))
}

async function openverseImageResultForQuery(query: string, category: PlaceType): Promise<FreeImageResult | null> {
  if (!query) return null
  if (isUnsafeBroadPublicImageQuery(query)) return null
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
      metadata: { query, category },
    }) as OpenverseImageResponse
    const matches = (data.results ?? [])
      .filter((item) => openverseResultMatches(query, item))
      .map((item) => ({
        item,
        url: openverseEmbeddableUrl(item),
      }))
      .filter((match): match is { item: OpenverseImageResult; url: string } => match.url !== null)
    const result = matches[0]?.item
    const photoUrls = Array.from(new Set(matches.map((match) => match.url))).slice(0, MAX_FREE_IMAGE_URLS)
    if (!result || photoUrls.length === 0) return null
    return {
      photoUrls,
      source: 'openverse',
      pageUrl: cleanText(result.foreign_landing_url),
      license: cleanText(result.license),
      attribution: cleanText(result.creator),
    }
  })
}

async function openverseImageResult(row: OpenPoiRow): Promise<FreeImageResult | null> {
  if (isUnsafeBroadPublicImageRow(row)) return null
  let merged: FreeImageResult | null = null
  for (const query of imageSearchAliasesForRow(row)) {
    const result = await openverseImageResultForQuery(query, row.category)
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return merged
  }
  return merged
}

async function wikimediaCommonsSearchImageResult(row: OpenPoiRow): Promise<FreeImageResult | null> {
  if (isUnsafeBroadPublicImageRow(row)) return null
  let merged: FreeImageResult | null = null
  for (const query of imageSearchAliasesForRow(row)) {
    const result = await wikimediaCommonsSearchImageResultForQuery(query, row.category)
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return merged
  }
  return merged
}

async function wikipediaSearchImageResult(row: OpenPoiRow): Promise<FreeImageResult | null> {
  if (isUnsafeBroadPublicImageRow(row)) return null
  let merged: FreeImageResult | null = null
  for (const query of imageSearchAliasesForRow(row)) {
    const result = await wikipediaSearchImageResultForQuery(query, row.category)
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return merged
  }
  return merged
}

async function openverseCategoryImageResult(category: PlaceType, seed: string): Promise<FreeImageResult | null> {
  const query = CATEGORY_FREE_IMAGE_QUERIES[category]
  let pool: FreeImageResult | null = null
  try {
    pool = await cachedFreeImage<FreeImageResult | null>(['openverse-category-pool', category, query], async () => {
      const params = new URLSearchParams({
        q: query,
        page_size: String(MAX_GENERIC_IMAGE_POOL_URLS),
        license_type: 'commercial,modification',
      })
      const data = await fetchJsonWithTimeout(`https://api.openverse.org/v1/images?${params.toString()}`, {
        provider: 'openverse',
        endpoint: 'category_image_search',
        skuHint: 'openverse_free',
        metadata: { query, category, fallback: 'category' },
      }) as OpenverseImageResponse
      const matches = (data.results ?? [])
        .map((item) => ({
          item,
          url: openverseEmbeddableUrl(item) ?? normalizeImageUrl(cleanText(item.thumbnail) ?? cleanText(item.url)),
        }))
        .filter((match): match is { item: OpenverseImageResult; url: string } => match.url !== null)
      const result = matches[0]?.item
      const photoUrls = Array.from(new Set(matches.map((match) => match.url))).slice(0, MAX_GENERIC_IMAGE_POOL_URLS)
      if (!result || photoUrls.length === 0) return null
      return {
        photoUrls,
        source: 'openverse',
        pageUrl: cleanText(result.foreign_landing_url),
        license: cleanText(result.license),
        attribution: cleanText(result.creator),
        generic: true,
      }
    })
  } catch {
    pool = null
  }
  if (!pool?.photoUrls.length) return staticCategoryImageResult(category, seed)
  return {
    ...pool,
    photoUrls: seededPhotoUrls(pool.photoUrls, seed),
    generic: true,
  }
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

interface ImageResolverContext {
  row: OpenPoiRow
  commonsCategory: string | null
  qid: string | null
  wikipedia: { lang: string; title: string } | null
}

interface ImageResolverSpec {
  key: string
  run: () => Promise<FreeImageResult | null>
}

interface ImageSourcePolicy {
  sources: Source[]
  signature: string
}

function imageSourcePriority(source: Source): number {
  return source.config.priority ?? Number.MAX_SAFE_INTEGER
}

function imageSourcePolicySignature(sources: Source[]): string {
  if (sources.length === 0) return DEFAULT_IMAGE_SOURCE_POLICY_SIGNATURE
  const payload = sources.map((source) => ({
    url: source.url,
    provider: source.config.provider ?? 'custom',
    scope: source.config.scope ?? 'custom',
    country: source.config.country ?? null,
    region: source.config.region ?? null,
    condition: source.config.condition ?? null,
    priority: source.config.priority ?? null,
  }))
  return `managed:${IMAGE_SOURCE_POLICY_VERSION}:` +
    createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16)
}

async function orderedImageSources(): Promise<Source[]> {
  try {
    return (await getImageSources()).sort((left, right) => {
      const priorityDelta = imageSourcePriority(left) - imageSourcePriority(right)
      if (priorityDelta !== 0) return priorityDelta
      return left.label.localeCompare(right.label)
    })
  } catch {
    return []
  }
}

async function currentImageSourcePolicy(): Promise<ImageSourcePolicy> {
  const sources = await orderedImageSources()
  return {
    sources,
    signature: imageSourcePolicySignature(sources),
  }
}

function addImageResolverSpec(
  specs: ImageResolverSpec[],
  seenKeys: Set<string>,
  key: string,
  run: () => Promise<FreeImageResult | null>
): void {
  if (seenKeys.has(key)) return
  seenKeys.add(key)
  specs.push({ key, run })
}

function addProviderImageResolvers(
  provider: ImageSourceProvider,
  context: ImageResolverContext,
  specs: ImageResolverSpec[],
  seenKeys: Set<string>
): void {
  switch (provider) {
    case 'official_website':
      addImageResolverSpec(specs, seenKeys, 'metadata-official-website', () => officialWebsiteImageResult(context.row))
      if (context.qid) {
        const qid = context.qid
        addImageResolverSpec(specs, seenKeys, 'wikidata-official-website', () => wikidataOfficialWebsiteImageResult(qid))
      }
      return
    case 'wikimedia_commons':
      if (context.commonsCategory) {
        const commonsCategory = context.commonsCategory
        addImageResolverSpec(specs, seenKeys, 'wikimedia-commons-category', () => wikimediaCommonsCategoryImageResult(commonsCategory))
      }
      addImageResolverSpec(specs, seenKeys, 'wikimedia-commons-search', () => wikimediaCommonsSearchImageResult(context.row))
      return
    case 'wikidata':
      if (context.qid) {
        const qid = context.qid
        addImageResolverSpec(specs, seenKeys, 'wikidata-official-website', () => wikidataOfficialWebsiteImageResult(qid))
        addImageResolverSpec(specs, seenKeys, 'wikidata-image', () => wikidataImageResult(qid))
      }
      return
    case 'wikipedia':
      if (context.wikipedia) {
        const wikipedia = context.wikipedia
        addImageResolverSpec(specs, seenKeys, 'wikipedia-tag', () => wikipediaImageResult(wikipedia.lang, wikipedia.title))
      }
      addImageResolverSpec(specs, seenKeys, 'wikipedia-search', () => wikipediaSearchImageResult(context.row))
      return
    case 'openverse':
      addImageResolverSpec(specs, seenKeys, 'openverse-search', () => openverseImageResult(context.row))
      return
    case 'rebake':
    case 'yahoo_map':
    case 'tabelog':
    case 'custom':
      return
  }
}

function imageResolverSpecsForRow(context: ImageResolverContext, configuredSources: Source[]): ImageResolverSpec[] {
  const specs: ImageResolverSpec[] = []
  const seenKeys = new Set<string>()

  if (configuredSources.length > 0) {
    for (const source of configuredSources) {
      addProviderImageResolvers(source.config.provider ?? 'custom', context, specs, seenKeys)
    }
  } else {
    for (const provider of DEFAULT_IMAGE_SOURCE_PROVIDERS) {
      addProviderImageResolvers(provider, context, specs, seenKeys)
    }
  }

  return specs
}

async function freeImageResultForRow(
  row: OpenPoiRow,
  allowGenericFallback = false,
  policy?: ImageSourcePolicy
): Promise<FreeImageLookupOutcome> {
  const imagePolicy = policy ?? await currentImageSourcePolicy()
  let merged = directImageResultFromMetadata(row.metadata, imagePolicy.signature)
  if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return { result: merged, cacheableMiss: true }

  const knownEntity = knownFreeImageEntityForAliases(imageSearchAliasesForRow(row))
  const commonsCategory = commonsCategoryFromMetadata(row.metadata) ?? knownEntity?.commonsCategory ?? null
  const qid = wikidataIdFromMetadata(row.metadata) ?? knownEntity?.wikidata ?? null
  const wikipedia = wikipediaTagFromMetadata(row.metadata) ?? knownEntity?.wikipedia ?? null
  const resolvers = imageResolverSpecsForRow({ row, commonsCategory, qid, wikipedia }, imagePolicy.sources)

  let hadFailure = false
  for (const resolver of resolvers) {
    const { result, failed } = await runImageResolver(resolver.run)
    hadFailure = hadFailure || failed
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) {
      return { result: merged, cacheableMiss: true }
    }
  }

  if (merged?.photoUrls.length) return { result: merged, cacheableMiss: !hadFailure }

  if (allowGenericFallback) {
    const { result, failed } = await runImageResolver(() => openverseCategoryImageResult(row.category, genericImageSeedForRow(row)))
    hadFailure = hadFailure || failed
    if (result?.photoUrls.length) return { result, cacheableMiss: true }
  }

  return { result: merged, cacheableMiss: !hadFailure }
}

export async function resolveFreeImageForPlace({
  placeId,
  placeName,
  aliases = [],
  category = 'attraction',
  allowGeneric = false,
  limit = 5,
}: {
  placeId?: string | null
  placeName: string
  aliases?: string[]
  category?: PlaceType
  allowGeneric?: boolean
  limit?: number
}): Promise<FreeImageResult | null> {
  const sourcePlaceId = cleanText(placeId) ?? cleanText(placeName) ?? 'unknown'
  const metadataAliases = aliases.filter((alias) => cleanText(alias))
  const policy = await currentImageSourcePolicy()
  const { result } = await freeImageResultForRow({
    source: 'user',
    source_place_id: sourcePlaceId,
    name_primary: placeName,
    name_zh: null,
    name_local: placeName,
    lat: 0,
    lng: 0,
    category,
    confidence: null,
    metadata: metadataAliases.length ? { image_search_aliases: metadataAliases } : {},
  }, allowGeneric, policy)
  if (!result?.photoUrls.length) return null
  return {
    ...result,
    photoUrls: result.photoUrls.slice(0, Math.max(1, Math.min(5, Math.trunc(limit)))),
  }
}

function buildFreeImageMetadataPatch(
  metadata: Record<string, unknown> | null | undefined,
  result: FreeImageResult | null,
  policySignature: string
): Record<string, unknown> {
  const fetchedAt = new Date().toISOString()
  const base = { ...(metadata ?? {}) }
  if (!result) {
    return {
      ...base,
      free_image: {
        status: 'not_found',
        version: FREE_IMAGE_LOOKUP_VERSION,
        policyVersion: IMAGE_SOURCE_POLICY_VERSION,
        policySignature,
        fetchedAt,
      },
    }
  }

  const freeImage: Record<string, unknown> = {
    status: 'found',
    version: FREE_IMAGE_LOOKUP_VERSION,
    policyVersion: IMAGE_SOURCE_POLICY_VERSION,
    policySignature,
    source: result.source,
    fetchedAt,
    url: result.photoUrls[0],
    urls: result.photoUrls,
  }
  if (typeof result.confidence === 'number') freeImage.confidence = result.confidence
  if (result.provenance?.length) {
    freeImage.photos = result.provenance.map((item) => ({
      url: item.url,
      source: item.source,
      confidence: item.confidence,
      pageUrl: item.pageUrl ?? null,
      license: item.license ?? null,
      attribution: item.attribution ?? null,
      generic: item.generic === true,
    }))
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

async function persistOpenPoiFreeImageMetadata(
  row: OpenPoiRow,
  result: FreeImageResult | null,
  policySignature: string
): Promise<void> {
  if (!hasSupabaseAdminEnv()) return
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    await createAdminClient()
      .from('poi_places')
      .update({
        metadata: buildFreeImageMetadataPatch(row.metadata, result, policySignature),
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

export function mapOpenPoiRowToPlace(row: OpenPoiRow, policySignature?: string | null): OpenPoiPlace {
  const description = cleanText(row.metadata?.description) ?? placeShortDescription(row.category)
  const zhName = cleanText(row.name_zh)
  const localName = cleanText(row.name_local)
  const primaryName = cleanText(row.name_primary) ?? row.source_place_id
  const photoUrls = imageUrlsFromMetadata(row.metadata, policySignature)
  const rating = metadataNumber(row.metadata, ['rating', 'google_rating', 'stars'])
  const reviewCount = metadataNumber(row.metadata, [
    'reviewCount',
    'review_count',
    'reviews',
    'review_total',
    'user_ratings_total',
    'google_user_ratings_total',
  ])
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
    rating,
    reviewCount,
    categoryTags: categoryTagsFromOpenPoiRow(row),
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    description,
    source: row.source,
    sourceLabel: 'Open POI',
  }
}

export async function mapOpenPoiRowToPlaceWithFreeImages(
  row: OpenPoiRow,
  policy?: ImageSourcePolicy
): Promise<OpenPoiPlace> {
  const imagePolicy = policy ?? await currentImageSourcePolicy()
  const place = mapOpenPoiRowToPlace(row, imagePolicy.signature)
  if ((place.photoUrls?.length ?? 0) > 0 || place.photoUrl) {
    await persistOpenPoiFreeImageMetadata(row, {
      photoUrls: place.photoUrls?.length ? place.photoUrls : place.photoUrl ? [place.photoUrl] : [],
      source: 'metadata',
    }, imagePolicy.signature)
    return place
  }

  if (hasRecentNotFoundImageCache(row.metadata, imagePolicy.signature)) return place

  const { result, cacheableMiss } = await freeImageResultForRow(row, false, imagePolicy)
  if (!result?.photoUrls.length) {
    if (cacheableMiss) await persistOpenPoiFreeImageMetadata(row, null, imagePolicy.signature)
    return place
  }

  await persistOpenPoiFreeImageMetadata(row, result, imagePolicy.signature)
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
    .map((row, index) => ({
      row,
      index,
      distance: haversineMeters({ lat, lng }, { lat: row.lat, lng: row.lng }),
      rankingPlace: mapOpenPoiRowToPlace(row),
    }))
    .filter(({ distance }) => distance <= radiusMeters)
    .sort((a, b) => {
      const acceptableA = isRecommendationCandidateAcceptable(a.rankingPlace, category)
      const acceptableB = isRecommendationCandidateAcceptable(b.rankingPlace, category)
      if (acceptableA !== acceptableB) return acceptableB ? 1 : -1
      const confidenceA = a.row.confidence ?? 0
      const confidenceB = b.row.confidence ?? 0
      return (
        compareRecommendationCandidates(a.rankingPlace, b.rankingPlace, category) ||
        a.distance - b.distance ||
        confidenceB - confidenceA ||
        a.index - b.index
      )
    })
    .slice(0, limit)
  const imagePolicy = await currentImageSourcePolicy()
  return Promise.all(rankedRows.map(({ row }) => mapOpenPoiRowToPlaceWithFreeImages(row, imagePolicy)))
}
