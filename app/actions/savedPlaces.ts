'use server'
import { randomUUID } from 'crypto'
import type { Place } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import type { SavedPlaceEntry, SavedPlaceSource } from '@/lib/takeout/parse'
import type { SavedPlaceRow } from '@/lib/savedPlaces/types'
import { resolvePlaceEssentials } from '@/app/actions/savedPlacesResolve'

function stubToPlace(stub: { placeId: string; name: string; type: Place['type']; lat: number; lng: number; address: string }): Place {
  return {
    id: randomUUID(),
    placeId: stub.placeId,
    name: stub.name,
    type: stub.type,
    lat: stub.lat,
    lng: stub.lng,
    address: stub.address,
    localizedName: null,
    localizedAddress: null,
    openingHours: null,
    rating: null,
    photoUrl: null,
    photoUrls: [],
    description: null,
  }
}

// Persist resolved rows every IMPORT_CHUNK so a large import that hits the server-action
// time limit keeps the progress made so far (a full async job for very large libraries is
// future work; the Part B client also chunks big selections across calls).
const IMPORT_CHUNK = 25

export async function importSavedPlaces(
  entries: SavedPlaceEntry[],
): Promise<{ added: number; existing: number; unresolved: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')

  let added = 0, existing = 0, unresolved = 0
  let batch: Record<string, unknown>[] = []

  // ignoreDuplicates → INSERT ... ON CONFLICT DO NOTHING; .select() returns only the rows
  // actually inserted, so added vs already-existing is accurate (spec: 「新增 N、已存在 M」).
  const flush = async () => {
    if (batch.length === 0) return
    const { data, error } = await supabase
      .from('saved_places')
      .upsert(batch, { onConflict: 'owner_id,list_name,place_id', ignoreDuplicates: true })
      .select('place_id')
    if (error) throw new Error('匯入失敗，請稍後再試')
    const inserted = data?.length ?? 0
    added += inserted
    existing += batch.length - inserted
    batch = []
  }

  for (const entry of entries) {
    const coords = entry.lat != null && entry.lng != null ? { lat: entry.lat, lng: entry.lng } : undefined
    let stub
    try {
      stub = await resolvePlaceEssentials(entry.title, coords)
    } catch {
      stub = null // transient / Google error → count unresolved, never abort the whole import
    }
    if (!stub) { unresolved++; continue }
    batch.push({
      owner_id: user.id,
      list_name: entry.listName,
      source: entry.source,
      place_id: stub.placeId,
      place: stubToPlace(stub),
      note: entry.note,
      updated_at: new Date().toISOString(),
    })
    if (batch.length >= IMPORT_CHUNK) await flush()
  }
  await flush()
  return { added, existing, unresolved }
}

export async function listSavedPlaces(): Promise<SavedPlaceRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('saved_places')
    .select('id, list_name, source, place')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as { id: string; list_name: string; source: SavedPlaceSource; place: Place }[])
    .map((r) => ({ id: r.id, listName: r.list_name, source: r.source, place: r.place }))
}
