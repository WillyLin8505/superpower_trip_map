'use server'
import { randomUUID } from 'crypto'
import type { Place } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import type { SavedPlaceEntry, SavedPlaceSource } from '@/lib/takeout/parse'
import { resolvePlaceEssentials } from '@/app/actions/savedPlacesResolve'

// Not exported: `'use server'` modules may only export async functions (Next build rule).
// Part B will lift this row shape into a shared non-server types module when the tab needs it.
interface SavedPlaceRow {
  id: string
  listName: string
  source: SavedPlaceSource
  place: Place
}

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

export async function importSavedPlaces(
  entries: SavedPlaceEntry[],
): Promise<{ added: number; existing: number; unresolved: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')

  const rows: Record<string, unknown>[] = []
  let unresolved = 0
  for (const entry of entries) {
    const coords = entry.lat != null && entry.lng != null ? { lat: entry.lat, lng: entry.lng } : undefined
    const stub = await resolvePlaceEssentials(entry.title, coords)
    if (!stub) { unresolved++; continue }
    rows.push({
      owner_id: user.id,
      list_name: entry.listName,
      source: entry.source,
      place_id: stub.placeId,
      place: stubToPlace(stub),
      note: entry.note,
      updated_at: new Date().toISOString(),
    })
  }
  if (rows.length === 0) return { added: 0, existing: 0, unresolved }

  // ignoreDuplicates → INSERT ... ON CONFLICT DO NOTHING; .select() returns only the rows
  // actually inserted, so added vs already-existing is accurate (spec: 「新增 N、已存在 M」).
  const { data, error } = await supabase
    .from('saved_places')
    .upsert(rows, { onConflict: 'owner_id,list_name,place_id', ignoreDuplicates: true })
    .select('place_id')
  if (error) throw new Error('匯入失敗，請稍後再試')
  const added = data?.length ?? 0
  return { added, existing: rows.length - added, unresolved }
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
