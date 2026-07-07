export type LineParsedText =
  | { kind: 'bind'; tripLinkOrToken: string }
  | { kind: 'malformed_bind' }
  | { kind: 'unbind' }
  | { kind: 'google_maps_url'; url: string }
  | { kind: 'article_url'; url: string }
  | { kind: 'place_text'; query: string }
  | { kind: 'ignored' }

const GOOGLE_MAPS_HOSTS = new Set([
  'maps.app.goo.gl',
  'maps.google.com',
  'www.google.com',
  'google.com',
  'goo.gl',
])

export function parseLineText(text: string | null | undefined): LineParsedText {
  const trimmed = text?.trim() ?? ''
  if (!trimmed) return { kind: 'ignored' }

  if (trimmed === '/閫?蝬?') return { kind: 'unbind' }

  if (trimmed.startsWith('/蝬?')) {
    const tripLinkOrToken = trimmed.slice('/蝬?'.length).trim()
    return tripLinkOrToken ? { kind: 'bind', tripLinkOrToken } : { kind: 'malformed_bind' }
  }

  const url = extractFirstUrl(trimmed)
  if (url) {
    return isGoogleMapsUrl(url)
      ? { kind: 'google_maps_url', url }
      : { kind: 'article_url', url }
  }

  if (trimmed.length < 3) return { kind: 'ignored' }
  return { kind: 'place_text', query: trimmed }
}

function extractFirstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s]+/)?.[0] ?? null
}

function isGoogleMapsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (GOOGLE_MAPS_HOSTS.has(parsed.hostname)) {
      return parsed.hostname.includes('maps') || parsed.pathname.includes('/maps')
    }
    return false
  } catch {
    return false
  }
}
