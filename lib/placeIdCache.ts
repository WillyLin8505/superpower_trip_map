import 'server-only'

import { createHash } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

type PlaceIdCacheRow = {
  place_id: string | null
}

function isEnabled(): boolean {
  const mode = process.env.GOOGLE_MAPS_PLACE_ID_CACHE_MODE ?? (process.env.NODE_ENV === 'test' ? 'off' : 'on')
  return mode !== 'off'
}

function hasSupabaseAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function buildPlaceIdLookupHash(query: string, countryName?: string): string {
  return createHash('sha256')
    .update(JSON.stringify({
      query: normalizeText(query),
      country: normalizeText(countryName),
    }))
    .digest('hex')
}

function isMissingCacheTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

export async function readCachedPlaceId(query: string, countryName?: string): Promise<string | null> {
  if (!isEnabled() || !hasSupabaseAdminEnv()) return null

  const admin = createAdminClient()
  const lookupHash = buildPlaceIdLookupHash(query, countryName)
  const { data, error } = await admin
    .from('place_id_cache')
    .select('place_id')
    .eq('provider', 'google')
    .eq('lookup_hash', lookupHash)
    .maybeSingle()

  if (isMissingCacheTable(error) || error || !data) return null

  const placeId = (data as PlaceIdCacheRow).place_id
  if (!placeId) return null

  await admin
    .from('place_id_cache')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('provider', 'google')
    .eq('lookup_hash', lookupHash)

  return placeId
}

export async function writeCachedPlaceId(query: string, countryName: string | undefined, placeId: string): Promise<void> {
  if (!isEnabled() || !hasSupabaseAdminEnv() || !placeId) return

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin
    .from('place_id_cache')
    .upsert({
      provider: 'google',
      lookup_hash: buildPlaceIdLookupHash(query, countryName),
      place_id: placeId,
      updated_at: now,
      last_seen_at: now,
      refreshed_at: now,
    }, { onConflict: 'provider,lookup_hash' })

  if (isMissingCacheTable(error) || !error) return
}
