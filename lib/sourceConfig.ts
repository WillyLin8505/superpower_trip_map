import type { ImageSourceProvider, SourceConfig, SourceKind } from '@/lib/types'

export const SOURCE_KIND_OPTIONS: SourceKind[] = ['recommendation', 'image']

export const IMAGE_SOURCE_PROVIDER_OPTIONS: ImageSourceProvider[] = [
  'official_website',
  'rebake',
  'yahoo_map',
  'tabelog',
  'custom',
]

export function sourceKindLabel(kind: SourceKind): string {
  return kind === 'image' ? '圖片來源' : '推薦來源'
}

export function imageSourceProviderLabel(provider: ImageSourceProvider): string {
  switch (provider) {
    case 'official_website':
      return '官方網站'
    case 'rebake':
      return 'ReBake'
    case 'yahoo_map':
      return 'Yahoo Map'
    case 'tabelog':
      return 'Tabelog'
    case 'custom':
    default:
      return '自訂網站'
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

export function normalizeSourceConfig(value: unknown, kind: SourceKind): SourceConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return kind === 'image' ? { provider: 'custom' } : {}
  }

  const config = value as Record<string, unknown>
  const normalized: SourceConfig = {}

  if (kind === 'image') {
    normalized.provider = normalizeImageSourceProvider(config.provider)
  }

  if (typeof config.notes === 'string' && config.notes.trim()) {
    normalized.notes = config.notes.trim()
  }

  return normalized
}
