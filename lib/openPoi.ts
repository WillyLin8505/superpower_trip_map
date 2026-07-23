import { randomUUID } from 'crypto'
import { unstable_cache } from 'next/cache'
import type { Place, PlaceType } from '@/lib/types'
import { haversineMeters } from '@/lib/haversine'
import { placeShortDescription } from '@/lib/utils/placeShortDescription'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { compareRecommendationCandidates, isRecommendationCandidateAcceptable } from '@/lib/utils/recommendationRank'

type OpenPoiSource = 'overture' | 'osm' | 'wikidata' | 'user'
type FreeImageSource = 'metadata' | 'wikimedia_commons' | 'wikidata' | 'wikipedia' | 'openverse' | 'static_free'
const FREE_IMAGE_TTL_SECONDS = 60 * 60 * 24 * 30
const FREE_IMAGE_LOOKUP_VERSION = 10
const FREE_IMAGE_FETCH_TIMEOUT_MS = 4000
const MAX_FREE_IMAGE_URLS = 5
const MAX_GENERIC_IMAGE_POOL_URLS = 50

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

function imageUrlsFromMetadata(metadata: Record<string, unknown> | null | undefined): string[] {
  const genericImageUrls = genericFreeImageUrlSet(metadata)
  const cache = freeImageCache(metadata)
  const useCachedFreeImageUrls = !cache || cache.version === FREE_IMAGE_LOOKUP_VERSION
  const candidates = [
    ...(useCachedFreeImageUrls ? metadataStrings(metadata, 'photoUrls') : []),
    ...(useCachedFreeImageUrls ? metadataStrings(metadata, 'photo_urls') : []),
    ...metadataStrings(metadata, 'images'),
    ...(useCachedFreeImageUrls ? [metadataString(metadata, 'photoUrl')] : []),
    ...(useCachedFreeImageUrls ? [metadataString(metadata, 'photo_url')] : []),
    metadataString(metadata, 'imageUrl'),
    metadataString(metadata, 'image_url'),
    metadataString(metadata, 'thumbnailUrl'),
    metadataString(metadata, 'thumbnail_url'),
    metadataString(metadata, 'image'),
    metadataString(metadata, 'image:0'),
    metadataString(metadata, 'image:1'),
    metadataString(metadata, 'wikimedia_commons'),
  ]
  return Array.from(new Set(candidates
    .map(normalizeImageUrl)
    .filter((url): url is string => url !== null && !genericImageUrls.has(url))))
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

function directImageResultFromMetadata(metadata: Record<string, unknown> | null | undefined): FreeImageResult | null {
  const photoUrls = imageUrlsFromMetadata(metadata)
  return photoUrls.length > 0 ? { photoUrls, source: 'metadata' } : null
}

function mergeFreeImageResults(current: FreeImageResult | null, next: FreeImageResult | null): FreeImageResult | null {
  if (!next?.photoUrls.length) return current
  if (!current?.photoUrls.length) {
    return {
      ...next,
      photoUrls: next.photoUrls.slice(0, MAX_FREE_IMAGE_URLS),
    }
  }

  return {
    ...current,
    photoUrls: Array.from(new Set([...current.photoUrls, ...next.photoUrls])).slice(0, MAX_FREE_IMAGE_URLS),
    generic: current.generic === true && next.generic === true,
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

function cachedFreeImage<T>(keyParts: string[], fetcher: () => Promise<T>): Promise<T> {
  return unstable_cache(fetcher, ['free-poi-image', String(FREE_IMAGE_LOOKUP_VERSION), ...keyParts], { revalidate: FREE_IMAGE_TTL_SECONDS })()
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
    if (!photoUrls.includes(url)) photoUrls.push(url)
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
  let merged: FreeImageResult | null = null
  for (const query of imageSearchAliasesForRow(row)) {
    const result = await openverseImageResultForQuery(query, row.category)
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return merged
  }
  return merged
}

async function wikimediaCommonsSearchImageResult(row: OpenPoiRow): Promise<FreeImageResult | null> {
  let merged: FreeImageResult | null = null
  for (const query of imageSearchAliasesForRow(row)) {
    const result = await wikimediaCommonsSearchImageResultForQuery(query, row.category)
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return merged
  }
  return merged
}

async function wikipediaSearchImageResult(row: OpenPoiRow): Promise<FreeImageResult | null> {
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

async function freeImageResultForRow(row: OpenPoiRow, allowGenericFallback = false): Promise<FreeImageLookupOutcome> {
  let merged = directImageResultFromMetadata(row.metadata)
  if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) return { result: merged, cacheableMiss: true }

  const resolvers: Array<() => Promise<FreeImageResult | null>> = []
  const knownEntity = knownFreeImageEntityForAliases(imageSearchAliasesForRow(row))
  const commonsCategory = commonsCategoryFromMetadata(row.metadata) ?? knownEntity?.commonsCategory ?? null
  if (commonsCategory) resolvers.push(() => wikimediaCommonsCategoryImageResult(commonsCategory))
  const qid = wikidataIdFromMetadata(row.metadata) ?? knownEntity?.wikidata ?? null
  if (qid) resolvers.push(() => wikidataImageResult(qid))
  const wikipedia = wikipediaTagFromMetadata(row.metadata) ?? knownEntity?.wikipedia ?? null
  if (wikipedia) resolvers.push(() => wikipediaImageResult(wikipedia.lang, wikipedia.title))
  resolvers.push(() => wikimediaCommonsSearchImageResult(row))
  resolvers.push(() => wikipediaSearchImageResult(row))
  resolvers.push(() => openverseImageResult(row))
  if (allowGenericFallback) resolvers.push(() => openverseCategoryImageResult(row.category, genericImageSeedForRow(row)))

  let hadFailure = false
  for (const resolver of resolvers) {
    const { result, failed } = await runImageResolver(resolver)
    hadFailure = hadFailure || failed
    merged = mergeFreeImageResults(merged, result)
    if ((merged?.photoUrls.length ?? 0) >= MAX_FREE_IMAGE_URLS) {
      return { result: merged, cacheableMiss: true }
    }
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
  }, allowGeneric)
  if (!result?.photoUrls.length) return null
  return {
    ...result,
    photoUrls: result.photoUrls.slice(0, Math.max(1, Math.min(5, Math.trunc(limit)))),
  }
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
  return Promise.all(rankedRows.map(({ row }) => mapOpenPoiRowToPlaceWithFreeImages(row)))
}
