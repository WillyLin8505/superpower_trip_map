'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Candidate, Place } from '@/lib/types'

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
    .select('id, place, added_by, created_at')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  const rows = data as { id: string; place: Place; added_by: string; created_at: string }[]

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
    out.push({ id: r.id, place: r.place, addedBy: r.added_by, addedByName: name })
  }
  return out
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
