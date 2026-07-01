'use server'
import { createClient } from '@/lib/supabase/server'
import type { PlanResult, TripSummary } from '@/lib/types'

export async function createTrip(plan: PlanResult, title: string): Promise<{ tripId: string }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { data, error } = await supabase
    .from('trips')
    .insert({ owner_id: user.id, title, plan })
    .select('id')
    .single()
  if (error || !data) throw new Error('儲存失敗，請稍後再試')
  return { tripId: (data as { id: string }).id }
}

export async function getTrip(tripId: string): Promise<{ plan: PlanResult; title: string } | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trips')
    .select('plan, title')
    .eq('id', tripId)
    .single()
  if (error || !data) return null
  const row = data as { plan: PlanResult; title: string }
  return { plan: row.plan, title: row.title }
}

export async function saveTrip(tripId: string, plan: PlanResult): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('trips')
    .update({ plan, updated_at: new Date().toISOString() })
    .eq('id', tripId)
  if (error) throw new Error('儲存失敗，請稍後再試')
}

export async function listTrips(): Promise<TripSummary[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('trips')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
  if (error || !data) return []
  return (data as { id: string; title: string; updated_at: string }[]).map((r) => ({
    id: r.id, title: r.title, updatedAt: r.updated_at,
  }))
}

export async function renameTrip(tripId: string, title: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('trips').update({ title }).eq('id', tripId)
  if (error) throw new Error('改名失敗，請稍後再試')
}

export async function deleteTrip(tripId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  if (error) throw new Error('刪除失敗，請稍後再試')
}
