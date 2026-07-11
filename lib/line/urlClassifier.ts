export type LineTextClassification =
  | { kind: 'google_maps_url'; url: string }
  | { kind: 'article_url'; url: string }
  | { kind: 'plain_text'; query: string }
  | { kind: 'ignore' }

const URL_RE = /https?:\/\/[^\s]+/i

export function classifyLineText(text: string): LineTextClassification {
  const trimmed = text.trim()

  if (trimmed.length < 2) {
    return { kind: 'ignore' }
  }

  const url = trimmed.match(URL_RE)?.[0]
  if (!url) {
    return { kind: 'plain_text', query: trimmed }
  }

  if (isGoogleMapsUrl(url)) {
    return { kind: 'google_maps_url', url }
  }

  return { kind: 'article_url', url }
}

function isGoogleMapsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()

    if (host === 'maps.app.goo.gl') {
      return true
    }

    if (host === 'goo.gl' && path.startsWith('/maps')) {
      return true
    }

    if (host === 'maps.google.com') {
      return true
    }

    return host.endsWith('.google.com') && path.startsWith('/maps')
  } catch {
    return false
  }
}
