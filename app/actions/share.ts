'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { PlanResult, TripLinkAccess } from '@/lib/types'
import { normalizeAccessEmail } from '@/lib/tripAccess'

type EmailPermissionRole = 'viewer' | 'editor'

export type TripEmailPermission = {
  email: string
  role: EmailPermissionRole
  createdAt: string
}

export type TripShareSettings = {
  tripId: string
  title: string
  shareToken: string
  linkAccess: TripLinkAccess
  emailPermissions: TripEmailPermission[]
}

export type SharedTrip = {
  tripId: string
  title: string
  plan: PlanResult
  linkAccess: Exclude<TripLinkAccess, 'restricted'>
  canEdit: boolean
}

export type SaveSharedTripResult =
  | { ok: true }
  | { ok: false; error: string; code?: string }

type TripShareRow = {
  id: string
  owner_id: string
  title: string
  share_token: string | null
  link_access: TripLinkAccess | null
}

type SharedTripRow = TripShareRow & {
  plan: PlanResult
}

type EmailPermissionRow = {
  email: string
  role: EmailPermissionRole
  created_at: string
}

type SupabaseErrorLike = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeLinkAccess(value: string): TripLinkAccess {
  if (value === 'view' || value === 'edit' || value === 'restricted') return value
  throw new Error('INVALID_LINK_ACCESS')
}

function normalizePermissionRole(value: string): EmailPermissionRole {
  if (value === 'viewer' || value === 'editor') return value
  throw new Error('INVALID_PERMISSION_ROLE')
}

function formatSupabaseError(
  fallback: string,
  error?: SupabaseErrorLike | null,
): { error: string; code?: string } {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean)
  return {
    error: parts.length > 0 ? parts.join(' ') : fallback,
    code: error?.code,
  }
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  return user.id
}

async function requireOwnerTrip(tripId: string, userId: string): Promise<TripShareRow> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .select('id, owner_id, title, share_token, link_access')
    .eq('id', tripId)
    .single()

  if (error || !data) throw new Error('TRIP_NOT_FOUND')

  const trip = data as TripShareRow
  if (trip.owner_id !== userId) throw new Error('NOT_OWNER')
  return trip
}

async function ensureShareToken(trip: TripShareRow): Promise<string> {
  if (trip.share_token) return trip.share_token

  const token = crypto.randomUUID()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .update({ share_token: token })
    .eq('id', trip.id)
    .eq('owner_id', trip.owner_id)
    .select('share_token')
    .single()

  if (error || !data) throw new Error('SHARE_TOKEN_UPDATE_FAILED')
  return (data as { share_token: string }).share_token
}

async function loadEmailPermissions(tripId: string): Promise<TripEmailPermission[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_email_permissions')
    .select('email, role, created_at')
    .eq('trip_id', tripId)
    .order('email', { ascending: true })

  if (error || !data) return []
  return (data as EmailPermissionRow[]).map((row) => ({
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  }))
}

async function settingsFromTrip(trip: TripShareRow): Promise<TripShareSettings> {
  return {
    tripId: trip.id,
    title: trip.title,
    shareToken: await ensureShareToken(trip),
    linkAccess: trip.link_access ?? 'restricted',
    emailPermissions: await loadEmailPermissions(trip.id),
  }
}

export async function getTripShareSettings(tripId: string): Promise<TripShareSettings> {
  const userId = await requireUserId()
  return settingsFromTrip(await requireOwnerTrip(tripId, userId))
}

export async function setTripLinkAccess(
  tripId: string,
  access: TripLinkAccess,
): Promise<TripShareSettings> {
  const userId = await requireUserId()
  const trip = await requireOwnerTrip(tripId, userId)
  const linkAccess = normalizeLinkAccess(access)
  const shareToken = await ensureShareToken(trip)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .update({ link_access: linkAccess, share_token: shareToken })
    .eq('id', tripId)
    .eq('owner_id', userId)
    .select('id, owner_id, title, share_token, link_access')
    .single()

  if (error || !data) throw new Error('SHARE_ACCESS_UPDATE_FAILED')
  revalidatePath(`/itinerary/${tripId}/share`)
  revalidatePath(`/itinerary/${tripId}`)
  return settingsFromTrip(data as TripShareRow)
}

export async function rotateShareLink(tripId: string): Promise<TripShareSettings> {
  const userId = await requireUserId()
  await requireOwnerTrip(tripId, userId)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .update({ share_token: crypto.randomUUID() })
    .eq('id', tripId)
    .eq('owner_id', userId)
    .select('id, owner_id, title, share_token, link_access')
    .single()

  if (error || !data) throw new Error('SHARE_LINK_ROTATE_FAILED')
  revalidatePath(`/itinerary/${tripId}/share`)
  return settingsFromTrip(data as TripShareRow)
}

export async function addTripEmailPermission(
  tripId: string,
  rawEmail: string,
  rawRole: EmailPermissionRole,
): Promise<TripShareSettings> {
  const userId = await requireUserId()
  await requireOwnerTrip(tripId, userId)
  const email = normalizeAccessEmail(rawEmail)
  if (!email) throw new Error('INVALID_EMAIL')
  const role = normalizePermissionRole(rawRole)

  const admin = createAdminClient()
  const { error } = await admin
    .from('trip_email_permissions')
    .upsert(
      { trip_id: tripId, email, role, updated_at: new Date().toISOString() },
      { onConflict: 'trip_id,email' },
    )

  if (error) throw new Error('EMAIL_PERMISSION_SAVE_FAILED')
  revalidatePath(`/itinerary/${tripId}/share`)
  revalidatePath(`/itinerary/${tripId}`)
  return getTripShareSettings(tripId)
}

export async function updateTripEmailPermission(
  tripId: string,
  email: string,
  rawRole: EmailPermissionRole,
): Promise<TripShareSettings> {
  const userId = await requireUserId()
  await requireOwnerTrip(tripId, userId)
  const normalizedEmail = normalizeAccessEmail(email)
  if (!normalizedEmail) throw new Error('INVALID_EMAIL')
  const role = normalizePermissionRole(rawRole)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_email_permissions')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('trip_id', tripId)
    .eq('email', normalizedEmail)
    .select('email')

  if (error || !data?.length) throw new Error('EMAIL_PERMISSION_SAVE_FAILED')
  revalidatePath(`/itinerary/${tripId}/share`)
  revalidatePath(`/itinerary/${tripId}`)
  return getTripShareSettings(tripId)
}

export async function removeTripEmailPermission(
  tripId: string,
  email: string,
): Promise<TripShareSettings> {
  const userId = await requireUserId()
  await requireOwnerTrip(tripId, userId)
  const normalizedEmail = normalizeAccessEmail(email)
  if (!normalizedEmail) throw new Error('INVALID_EMAIL')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_email_permissions')
    .delete()
    .eq('trip_id', tripId)
    .eq('email', normalizedEmail)
    .select('email')

  if (error || !data?.length) throw new Error('EMAIL_PERMISSION_REMOVE_FAILED')
  revalidatePath(`/itinerary/${tripId}/share`)
  revalidatePath(`/itinerary/${tripId}`)
  return getTripShareSettings(tripId)
}

export async function getSharedTrip(token: string): Promise<SharedTrip | null> {
  if (!UUID_RE.test(token)) return null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .select('id, owner_id, title, plan, share_token, link_access')
    .eq('share_token', token)
    .single()

  if (error || !data) return null
  const trip = data as SharedTripRow
  if (trip.link_access !== 'view' && trip.link_access !== 'edit') return null

  return {
    tripId: trip.id,
    title: trip.title,
    plan: trip.plan,
    linkAccess: trip.link_access,
    canEdit: trip.link_access === 'edit',
  }
}

export async function saveSharedTripSafe(token: string, plan: PlanResult): Promise<SaveSharedTripResult> {
  if (!UUID_RE.test(token)) return { ok: false, error: '分享連結無效' }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('trips')
      .update({ plan, updated_at: new Date().toISOString() })
      .eq('share_token', token)
      .eq('link_access', 'edit')
      .select('id')

    if (error || !data?.length) {
      console.error('saveSharedTripSafe failed', {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        rows: data?.length ?? 0,
      })
      return { ok: false, ...formatSupabaseError('分享連結沒有編輯權限', error) }
    }

    return { ok: true }
  } catch (error) {
    console.error('saveSharedTripSafe unexpected failure', error)
    return { ok: false, error: error instanceof Error ? error.message : '儲存失敗，請稍後再試' }
  }
}
