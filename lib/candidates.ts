import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { LineCandidateSource, Place, TripCandidate } from '@/lib/types'

type CandidateRow = {
  id: string
  trip_id: string
  place_id: string | null
  place: Place
  added_by: string
  source: LineCandidateSource | null
  created_at: string
}

export async function addCandidateFromLine(input: {
  tripId: string
  writeAsUserId: string
  place: Place
  source: LineCandidateSource
}): Promise<'added' | 'duplicate'> {
  const admin = createAdminClient()

  if (input.place.placeId) {
    const { data: existing, error } = await admin
      .from('trip_candidates')
      .select('id')
      .eq('trip_id', input.tripId)
      .eq('place_id', input.place.placeId)
      .maybeSingle()

    if (error) throw new Error('ADD_LINE_CANDIDATE_FAILED')
    if (existing) return 'duplicate'
  }

  const { error } = await admin.from('trip_candidates').insert({
    trip_id: input.tripId,
    place_id: input.place.placeId || null,
    place: input.place,
    added_by: input.writeAsUserId,
    source: input.source,
  })

  if (error) {
    if (isDuplicateKeyError(error)) return 'duplicate'
    throw new Error('ADD_LINE_CANDIDATE_FAILED')
  }

  return 'added'
}

/** @knipignore admin-client 版本，line-candidates 測試覆蓋；尚未接進 UI */
export async function listCandidates(tripId: string): Promise<TripCandidate[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_candidates')
    .select('id, trip_id, place_id, place, added_by, source, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })

  if (error || !data) return []

  return (data as CandidateRow[]).map((row) => ({
    id: row.id,
    tripId: row.trip_id,
    placeId: row.place_id,
    place: row.place,
    addedBy: row.added_by,
    addedByName: null,
    source: row.source,
    createdAt: row.created_at,
  }))
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505'
}
