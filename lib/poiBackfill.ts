import { cachedGoogle } from '@/lib/googleCache'
import { roundedCoordinate } from '@/lib/googleMapsCost'
import { fetchOverpassPois, type OpenPoiCategory } from '@/lib/overpass'
import type { OpenPoiRow } from '@/lib/openPoi'

const BACKFILL_RADIUS_M = 4000
const BACKFILL_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days — OSM POIs are stable

function hasSupabaseAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function upsertPoiPlaces(rows: OpenPoiRow[]): Promise<void> {
  if (rows.length === 0 || !hasSupabaseAdminEnv()) return
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const now = new Date().toISOString()
  const payload = rows.map((row) => ({ ...row, license: 'ODbL', updated_at: now }))
  await createAdminClient()
    .from('poi_places')
    .upsert(payload, { onConflict: 'source,source_place_id,category' })
}

// Populate poi_places for an area+category from free OSM/Overpass data, at most
// once per rounded cell per TTL (deduped via the Data Cache). Best-effort: an
// Overpass failure throws inside the cached fetcher so it is NOT cached (retried
// next time) and is swallowed here, so recommendations always fall back to Google.
export async function ensurePoiBackfill(
  lat: number,
  lng: number,
  category: OpenPoiCategory,
): Promise<void> {
  if (!hasSupabaseAdminEnv()) return
  const cellLat = roundedCoordinate(lat)
  const cellLng = roundedCoordinate(lng)
  try {
    await cachedGoogle(
      ['poi-backfill', String(cellLat), String(cellLng), category],
      async () => {
        const rows = await fetchOverpassPois(lat, lng, BACKFILL_RADIUS_M, category)
        await upsertPoiPlaces(rows)
        return rows.length
      },
      BACKFILL_TTL_SECONDS,
    )
  } catch {
    // Overpass/DB failure — not cached, retried next time; recommendations use Google.
  }
}
