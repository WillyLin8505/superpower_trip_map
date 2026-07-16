import type { PlaceType } from '@/lib/types'
import type { OpenPoiRow } from '@/lib/openPoi'

// Free OpenStreetMap POI lookups via the Overpass API. Used to backfill
// poi_places so recommendations can be served from free open data instead of
// paid Google Nearby Search. No API key; usage is kept gentle by the per-cell
// backfill dedup in lib/poiBackfill.ts.
const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL ?? 'https://overpass-api.de/api/interpreter'
const OVERPASS_TIMEOUT_MS = 12_000

export type OpenPoiCategory = 'attraction' | 'restaurant' | 'dessert'

// OSM tag filters (Overpass QL fragments) per recommendation category.
const CATEGORY_FILTERS: Record<OpenPoiCategory, string[]> = {
  restaurant: ['[amenity=restaurant]', '[amenity=fast_food]'],
  dessert: ['[amenity=cafe]', '[amenity=ice_cream]', '[shop=bakery]', '[shop=pastry]', '[shop=confectionery]'],
  attraction: [
    '[tourism=attraction]', '[tourism=museum]', '[tourism=viewpoint]',
    '[tourism=artwork]', '[tourism=gallery]', '[historic]', '[leisure=park]',
  ],
}

export function buildOverpassQuery(lat: number, lng: number, radiusM: number, category: OpenPoiCategory): string {
  const clauses = CATEGORY_FILTERS[category]
    .flatMap((f) => [
      `node(around:${radiusM},${lat},${lng})${f};`,
      `way(around:${radiusM},${lat},${lng})${f};`,
    ])
    .join('\n')
  return `[out:json][timeout:20];(\n${clauses}\n);out center 80;`
}

interface OverpassElement {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function cleanTag(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function overpassElementToRow(el: OverpassElement, category: OpenPoiCategory): OpenPoiRow | null {
  const tags = el.tags ?? {}
  const name = cleanTag(tags.name) ?? cleanTag(tags['name:zh']) ?? cleanTag(tags['name:en'])
  if (!name) return null // recommendations need a display name
  const lat = el.lat ?? el.center?.lat
  const lng = el.lon ?? el.center?.lon
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const nameZh = cleanTag(tags['name:zh']) ?? cleanTag(tags['name:zh-Hant'])
  return {
    source: 'osm',
    source_place_id: `${el.type}/${el.id}`,
    name_primary: name,
    name_zh: nameZh ?? null,
    name_local: cleanTag(tags['name:en']) ?? cleanTag(tags.name) ?? null,
    lat,
    lng,
    category: category as PlaceType,
    confidence: null,
    metadata: { osm: { amenity: tags.amenity, tourism: tags.tourism, shop: tags.shop, historic: tags.historic } },
  }
}

// Throws on transport/HTTP failure so the caller (poiBackfill) can avoid caching
// a failed backfill. Returns [] only when Overpass genuinely returns no named POIs.
export async function fetchOverpassPois(
  lat: number,
  lng: number,
  radiusM: number,
  category: OpenPoiCategory,
): Promise<OpenPoiRow[]> {
  const query = buildOverpassQuery(lat, lng, radiusM, category)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS)
  try {
    const res = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'superpower-trip-map/1.0 (open POI backfill)',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`overpass_${res.status}`)
    const data = (await res.json()) as { elements?: OverpassElement[] }
    const rows: OpenPoiRow[] = []
    const seen = new Set<string>()
    for (const el of data.elements ?? []) {
      const row = overpassElementToRow(el, category)
      if (!row || seen.has(row.source_place_id)) continue
      seen.add(row.source_place_id)
      rows.push(row)
    }
    return rows
  } finally {
    clearTimeout(timeout)
  }
}
