'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Candidate, CandidateSource, Place } from '@/lib/types'

function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505'
}

function isMissingListColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  return e?.code === '42703' || e?.code === 'PGRST204' || /list/i.test(e?.message ?? '')
}

function missingArchiveMigrationError(): Error {
  return new Error('備用行程資料庫尚未更新，請套用 migration 0007_archive_list.sql')
}

async function canAccessTrip(tripId: string, userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: trip, error: tripError } = await admin
    .from('trips')
    .select('owner_id')
    .eq('id', tripId)
    .single()
  if (tripError || !trip) return false
  if ((trip as { owner_id: string }).owner_id === userId) return true

  const { data: membership, error: membershipError } = await admin
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle()
  return !membershipError && !!membership
}

async function requireCandidateAccess(
  candidateId: string,
  userId: string
): Promise<{ id: string; trip_id: string; place: Place; added_by: string; source?: CandidateSource | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_candidates')
    .select('id, trip_id, place, added_by, source')
    .eq('id', candidateId)
    .single()
  if (error || !data) throw new Error('NOT_FOUND')
  const row = data as { id: string; trip_id: string; place: Place; added_by: string; source?: CandidateSource | null }
  if (!(await canAccessTrip(row.trip_id, userId))) throw new Error('NOT_AUTHORIZED')
  return row
}

async function resolveCandidateNames(
  rows: { id: string; place: Place; added_by: string; created_at: string; source?: CandidateSource | null }[]
): Promise<Candidate[]> {
  const admin = createAdminClient()
  const nameCache = new Map<string, string>()
  const out: Candidate[] = []
  for (const r of rows) {
    let name = nameCache.get(r.added_by)
    if (name === undefined) {
      const { data: u } = await admin.auth.admin.getUserById(r.added_by)
      const meta = (u?.user?.user_metadata ?? {}) as { name?: string; full_name?: string }
      name = meta.name ?? meta.full_name ?? u?.user?.email ?? '使用者'
      nameCache.set(r.added_by, name)
    }
    out.push({ id: r.id, place: r.place, addedBy: r.added_by, addedByName: name, source: r.source ?? null })
  }
  return out
}

export async function addCandidate(tripId: string, place: Place): Promise<{ id: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { data, error } = await supabase
    .from('trip_candidates')
    .insert({ trip_id: tripId, place, added_by: user.id })
    .select('id')
    .single()
  if (error || !data) throw new Error('加入失敗，請稍後再試')
  return { id: (data as { id: string }).id }
}

export async function listCandidates(tripId: string): Promise<Candidate[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('trip_candidates')
    .select('id, place, added_by, source, created_at')
    .eq('trip_id', tripId)
    .eq('list', 'candidate')
    .order('created_at', { ascending: true })
  if (isMissingListColumn(error)) {
    const { data: fallback, error: fallbackError } = await supabase
      .from('trip_candidates')
      .select('id, place, added_by, source, created_at')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
    if (fallbackError || !fallback) return []
    return resolveCandidateNames((fallback as { id: string; place: Place; added_by: string; source?: CandidateSource | null; created_at: string }[])
      .filter((row) => row.source?.kind === 'line_group'))
  }
  if (error || !data) return []
  return resolveCandidateNames((data as { id: string; place: Place; added_by: string; source?: CandidateSource | null; created_at: string }[])
    .filter((row) => row.source?.kind === 'line_group'))
}

export async function removeCandidate(candidateId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { data, error } = await supabase
    .from('trip_candidates')
    .delete()
    .eq('id', candidateId)
    .select('id')
  if (error || !data?.length) throw new Error('移除失敗，請稍後再試')
}

export async function archiveCandidate(candidateId: string): Promise<{ id: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  await requireCandidateAccess(candidateId, user.id)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_candidates')
    .update({ list: 'archived' })
    .eq('id', candidateId)
    .select('id')
    .single()
  if (isMissingListColumn(error)) throw missingArchiveMigrationError()
  if (error || !data) throw new Error('\u79fb\u5230\u5099\u7528\u884c\u7a0b\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002')
  return { id: (data as { id: string }).id }
}

// TASK-022: archive = per-trip parking lot, reusing trip_candidates with list='archived'.
// If this place is already tracked for this trip (e.g. an existing LINE candidate row,
// or already archived), the unique (trip_id, place_id) index rejects the insert — flip
// that existing row to list='archived' instead of silently no-op'ing (a plain "duplicate
// -> do nothing" would mean archiving an existing candidate never actually archives it).
export async function archivePlace(tripId: string, place: Place): Promise<{ id: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  if (!(await canAccessTrip(tripId, user.id))) throw new Error('NOT_AUTHORIZED')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_candidates')
    .insert({ trip_id: tripId, place, place_id: place.placeId || null, added_by: user.id, list: 'archived' })
    .select('id')
    .single()
  if (error) {
    if (isMissingListColumn(error)) throw missingArchiveMigrationError()
    if (isDuplicateKeyError(error) && place.placeId) {
      const { data: updated, error: updateError } = await admin
        .from('trip_candidates')
        .update({ list: 'archived' })
        .eq('trip_id', tripId)
        .eq('place_id', place.placeId)
        .select('id')
        .single()
      if (isMissingListColumn(updateError)) throw missingArchiveMigrationError()
      if (updateError || !updated) throw new Error('\u5c01\u5b58\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66')
      return { id: (updated as { id: string }).id }
    }
    throw new Error('\u5c01\u5b58\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66')
  }
  if (!data) throw new Error('\u5c01\u5b58\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66')
  return { id: (data as { id: string }).id }
}

export async function listArchived(tripId: string): Promise<Candidate[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  if (!(await canAccessTrip(tripId, user.id))) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_candidates')
    .select('id, place, added_by, source, created_at')
    .eq('trip_id', tripId)
    .eq('list', 'archived')
    .order('created_at', { ascending: true })
  if (isMissingListColumn(error)) return []
  if (error || !data) return []
  return resolveCandidateNames(data as { id: string; place: Place; added_by: string; source?: CandidateSource | null; created_at: string }[])
}

export async function unarchivePlace(candidateId: string): Promise<void> {
  return removeCandidate(candidateId)
}
