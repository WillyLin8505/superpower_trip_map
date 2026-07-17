'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanResult, TripSummary } from '@/lib/types'
import { ensurePlanChineseNames } from '@/lib/utils/bilingualNames'
import { runWithTripId } from '@/lib/apiUsageContext'

export type CreateTripResult =
  | { ok: true; tripId: string }
  | { ok: false; error: string; code?: string }

export type SaveTripResult =
  | { ok: true }
  | { ok: false; error: string; code?: string }

type SupabaseErrorLike = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

function formatSupabaseError(
  fallback: string,
  error?: SupabaseErrorLike | null,
  extra?: string,
): { error: string; code?: string } {
  const parts = [
    error?.message,
    error?.details,
    error?.hint,
    extra,
  ].filter(Boolean)

  return {
    error: parts.length > 0 ? parts.join(' ') : fallback,
    code: error?.code,
  }
}

function formatUnknownError(fallback: string, error: unknown): { error: string } {
  if (error instanceof Error && error.message) return { error: error.message }
  if (typeof error === 'string' && error) return { error }
  return { error: fallback }
}

async function requireTripAccess(tripId: string, userId: string): Promise<SaveTripResult> {
  const admin = createAdminClient()
  const { data: trip, error: tripError } = await admin
    .from('trips')
    .select('owner_id')
    .eq('id', tripId)
    .single()

  if (tripError || !trip) {
    return { ok: false, ...formatSupabaseError('找不到行程或無法讀取行程', tripError) }
  }

  if ((trip as { owner_id: string }).owner_id === userId) return { ok: true }

  const { data: membership, error: membershipError } = await admin
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle()

  if (membershipError) {
    return { ok: false, ...formatSupabaseError('無法確認行程成員權限', membershipError) }
  }

  if (!membership) return { ok: false, error: '你沒有權限編輯這個行程' }

  return { ok: true }
}

export async function createTrip(plan: PlanResult, title: string): Promise<{ tripId: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  const { data, error } = await supabase
    .from('trips')
    .insert({ owner_id: user.id, title, plan })
    .select('id')
    .single()
  if (error || !data) {
    console.error('createTrip failed', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
    })
    throw new Error('儲存失敗，請稍後再試')
  }
  return { tripId: (data as { id: string }).id }
}

export async function createTripSafe(plan: PlanResult, title: string): Promise<CreateTripResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'NOT_AUTHENTICATED' }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('trips')
      .insert({ owner_id: user.id, title, plan })
      .select('id')
      .single()

    if (error || !data) {
      console.error('createTripSafe failed', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      })
      return { ok: false, ...formatSupabaseError('儲存失敗，請稍後再試', error) }
    }

    return { ok: true, tripId: (data as { id: string }).id }
  } catch (error) {
    console.error('createTripSafe unexpected failure', error)
    return { ok: false, ...formatUnknownError('儲存失敗，請稍後再試', error) }
  }
}

export async function getTrip(tripId: string): Promise<{ plan: PlanResult; title: string; ownerId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const access = await requireTripAccess(tripId, user.id)
  if (!access.ok) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .select('plan, title, owner_id')
    .eq('id', tripId)
    .single()
  if (error || !data) return null
  const row = data as { plan: PlanResult; title: string; owner_id: string }
  return { plan: await runWithTripId(tripId, () => ensurePlanChineseNames(row.plan)), title: row.title, ownerId: row.owner_id }
}

export async function saveTrip(tripId: string, plan: PlanResult): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trips')
    .update({ plan, updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .select('id')
  if (error || !data?.length) {
    console.error('saveTrip failed', {
      tripId,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      rows: data?.length ?? 0,
    })
    throw new Error('儲存失敗，請稍後再試')
  }
}

export async function saveTripSafe(tripId: string, plan: PlanResult): Promise<SaveTripResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'NOT_AUTHENTICATED' }

    const access = await requireTripAccess(tripId, user.id)
    if (!access.ok) return access

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('trips')
      .update({ plan, updated_at: new Date().toISOString() })
      .eq('id', tripId)
      .select('id')

    if (error || !data?.length) {
      console.error('saveTripSafe failed', {
        tripId,
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        rows: data?.length ?? 0,
      })
      return {
        ok: false,
        ...formatSupabaseError(
          '儲存失敗，請稍後再試',
          error,
          !error && !data?.length ? 'No rows were updated. You may not have permission to edit this trip.' : undefined,
        ),
      }
    }

    return { ok: true }
  } catch (error) {
    console.error('saveTripSafe unexpected failure', error)
    return { ok: false, ...formatUnknownError('儲存失敗，請稍後再試', error) }
  }
}

export async function listTrips(): Promise<TripSummary[]> {
  const supabase = await createClient()
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
  const supabase = await createClient()
  const { data, error } = await supabase.from('trips').update({ title }).eq('id', tripId).select('id')
  if (error || !data?.length) throw new Error('改名失敗，請稍後再試')
}

export async function deleteTrip(tripId: string): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('trips').delete().eq('id', tripId).select('id')
  if (error || !data?.length) throw new Error('刪除失敗，請稍後再試')
}
