import type { LocalizedText } from '@/lib/types'

export interface ResolvedLocalizedText {
  primary: string
  secondary: string | null
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function resolveLocalizedText(
  localized: LocalizedText | null | undefined,
  fallback: string | null | undefined
): ResolvedLocalizedText {
  const values = [
    cleanText(localized?.zhTw),
    cleanText(localized?.en),
    cleanText(localized?.original),
    cleanText(fallback),
  ]
  const primary = values.find((value): value is string => value !== null) ?? ''
  const secondary = values.find((value): value is string => value !== null && value !== primary) ?? null

  return { primary, secondary }
}

export function resolveLocalizedAddress(
  localized: LocalizedText | null | undefined,
  fallback: string | null | undefined
): string | null {
  return [
    cleanText(localized?.zhTw),
    cleanText(localized?.en),
    cleanText(localized?.original),
    cleanText(fallback),
  ].find((value): value is string => value !== null) ?? null
}
