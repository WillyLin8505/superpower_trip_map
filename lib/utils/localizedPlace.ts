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
  const primaryValues = [
    cleanText(localized?.zhTw),
    cleanText(localized?.en),
    cleanText(localized?.original),
    cleanText(fallback),
  ]
  const primary = primaryValues.find((value): value is string => value !== null) ?? ''
  const secondaryValues = [
    cleanText(localized?.original),
    cleanText(localized?.en),
    cleanText(fallback),
  ]
  const secondary = secondaryValues.find((value): value is string => value !== null && value !== primary) ?? null

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
