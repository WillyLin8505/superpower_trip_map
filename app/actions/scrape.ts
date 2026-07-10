'use server'

import { lookup } from 'dns/promises'
import { isIP } from 'net'

const MAX_REDIRECTS = 3
const MAX_BYTES = 512_000

export async function scrapeText(url: string): Promise<string | null> {
  try {
    const safeUrl = await resolveSafeUrl(url)
    if (!safeUrl) return null

    const res = await fetch(safeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ItineraryBot/1.0)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    })

    if (isRedirect(res.status)) {
      const location = res.headers.get('location')
      if (!location) return null
      const redirected = new URL(location, safeUrl).toString()
      return scrapeTextWithRedirectLimit(redirected, 1)
    }

    if (!res.ok) return null
    if (!isHtmlResponse(res)) return null

    const contentLength = res.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_BYTES) return null

    const html = await res.text()
    if (html.length > MAX_BYTES) return null
    return htmlToText(html)
  } catch {
    return null
  }
}

async function scrapeTextWithRedirectLimit(url: string, redirectCount: number): Promise<string | null> {
  if (redirectCount > MAX_REDIRECTS) return null

  try {
    const safeUrl = await resolveSafeUrl(url)
    if (!safeUrl) return null

    const res = await fetch(safeUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ItineraryBot/1.0)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    })

    if (isRedirect(res.status)) {
      const location = res.headers.get('location')
      if (!location) return null
      return scrapeTextWithRedirectLimit(new URL(location, safeUrl).toString(), redirectCount + 1)
    }

    if (!res.ok) return null
    if (!isHtmlResponse(res)) return null

    const contentLength = res.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_BYTES) return null

    const html = await res.text()
    if (html.length > MAX_BYTES) return null
    return htmlToText(html)
  } catch {
    return null
  }
}

async function resolveSafeUrl(rawUrl: string): Promise<string | null> {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null

  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return null

  const literalIp = normalizeIpLiteral(host)
  if (literalIp) {
    return isPublicIp(literalIp) ? parsed.toString() : null
  }

  const results = await lookup(host, { all: true, verbatim: true })
  if (results.length === 0) return null
  if (results.some((result) => !isPublicIp(result.address))) return null

  return parsed.toString()
}

function normalizeIpLiteral(host: string): string | null {
  const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  return isIP(unbracketed) ? unbracketed : null
}

function isPublicIp(address: string): boolean {
  if (isPrivateIpv4(address)) return false
  if (isPrivateIpv6(address)) return false
  return isIP(address) !== 0
}

function isPrivateIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false
  const [a, b] = address.split('.').map(Number)

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  )
}

function isPrivateIpv6(address: string): boolean {
  if (isIP(address) !== 6) return false
  const lower = address.toLowerCase()
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80:') ||
    lower.startsWith('::ffff:127.') ||
    lower.startsWith('::ffff:10.') ||
    lower.startsWith('::ffff:192.168.') ||
    lower.startsWith('::ffff:169.254.')
  )
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

function isHtmlResponse(res: Response): boolean {
  const contentType = res.headers.get('content-type')
  return !contentType || contentType.toLowerCase().includes('text/html')
}

function htmlToText(html: string): string | null {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000)
  return text || null
}
