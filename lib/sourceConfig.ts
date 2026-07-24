import type { ImageSourceProvider, ImageSourceScope, SourceConfig, SourceKind } from '@/lib/types'

export const SOURCE_KIND_OPTIONS: SourceKind[] = ['recommendation', 'image']

export const IMAGE_SOURCE_PROVIDER_OPTIONS: ImageSourceProvider[] = [
  'official_website',
  'wikidata',
  'wikipedia',
  'wikimedia_commons',
  'openverse',
  'rebake',
  'yahoo_map',
  'tabelog',
  'custom',
]

export const IMAGE_SOURCE_SCOPE_OPTIONS: ImageSourceScope[] = [
  'regional_official',
  'national_official',
  'public_database',
  'public_media',
  'commercial_directory',
  'custom',
]

export function sourceKindLabel(kind: SourceKind): string {
  return kind === 'image' ? '圖片來源' : '推薦來源'
}

export function imageSourceProviderLabel(provider: ImageSourceProvider): string {
  switch (provider) {
    case 'official_website':
      return '官方網站'
    case 'wikidata':
      return 'Wikidata'
    case 'wikipedia':
      return 'Wikipedia'
    case 'wikimedia_commons':
      return 'Wikimedia Commons'
    case 'openverse':
      return 'Openverse'
    case 'rebake':
      return 'ReBake'
    case 'yahoo_map':
      return 'Yahoo Map'
    case 'tabelog':
      return 'Tabelog'
    case 'custom':
    default:
      return '自訂來源'
  }
}

export function imageSourceScopeLabel(scope: ImageSourceScope): string {
  switch (scope) {
    case 'regional_official':
      return '區域官方優先'
    case 'national_official':
      return '國家官方'
    case 'public_database':
      return '公開資料庫'
    case 'public_media':
      return '公開圖片庫'
    case 'commercial_directory':
      return '商業目錄'
    case 'custom':
    default:
      return '自訂條件'
  }
}

export function normalizeSourceKind(value: unknown): SourceKind {
  return value === 'image' ? 'image' : 'recommendation'
}

export function normalizeImageSourceProvider(value: unknown): ImageSourceProvider {
  return IMAGE_SOURCE_PROVIDER_OPTIONS.includes(value as ImageSourceProvider)
    ? value as ImageSourceProvider
    : 'custom'
}

export function normalizeImageSourceScope(value: unknown): ImageSourceScope {
  return IMAGE_SOURCE_SCOPE_OPTIONS.includes(value as ImageSourceScope)
    ? value as ImageSourceScope
    : 'custom'
}

function cleanConfigText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function cleanCountry(value: unknown): string | undefined {
  const cleaned = cleanConfigText(value)?.toUpperCase()
  return cleaned && /^[A-Z]{2}$/.test(cleaned) ? cleaned : undefined
}

function cleanPriority(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.trunc(parsed))
}

export function normalizeSourceConfig(value: unknown, kind: SourceKind): SourceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return kind === 'image' ? { provider: 'custom', scope: 'custom' } : {}
  }

  const config = value as Record<string, unknown>
  const normalized: SourceConfig = {}

  if (kind === 'image') {
    normalized.provider = normalizeImageSourceProvider(config.provider)
    normalized.scope = normalizeImageSourceScope(config.scope)

    const country = cleanCountry(config.country)
    if (country) normalized.country = country

    const region = cleanConfigText(config.region)
    if (region) normalized.region = region

    const condition = cleanConfigText(config.condition)
    if (condition) normalized.condition = condition

    const priority = cleanPriority(config.priority)
    if (priority !== undefined) normalized.priority = priority
  }

  const notes = cleanConfigText(config.notes)
  if (notes) normalized.notes = notes

  return normalized
}
