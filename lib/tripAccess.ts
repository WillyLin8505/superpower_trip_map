import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TripAccessRole } from '@/lib/types'

type AuthUserLike = {
  id: string
  email?: string | null
}

type TripAccessResult = {
  role: TripAccessRole | null
  ownerId: string | null
}

export function normalizeAccessEmail(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) return null
  return normalized
}

export async function resolveTripAccess(
  tripId: string,
  user: AuthUserLike | null | undefined,
): Promise<TripAccessResult> {
  const admin = createAdminClient()
  const { data: trip, error: tripError } = await admin
    .from('trips')
    .select('owner_id')
    .eq('id', tripId)
    .single()

  if (tripError || !trip) return { role: null, ownerId: null }

  const ownerId = (trip as { owner_id: string }).owner_id
  if (!user) return { role: null, ownerId }
  if (ownerId === user.id) return { role: 'owner', ownerId }

  const { data: membership, error: membershipError } = await admin
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membershipError && membership) return { role: 'editor', ownerId }

  const email = normalizeAccessEmail(user.email)
  if (!email) return { role: null, ownerId }

  const { data: permission, error: permissionError } = await admin
    .from('trip_email_permissions')
    .select('role')
    .eq('trip_id', tripId)
    .eq('email', email)
    .maybeSingle()

  if (permissionError || !permission) return { role: null, ownerId }

  const role = (permission as { role: string }).role
  return {
    role: role === 'editor' ? 'editor' : role === 'viewer' ? 'viewer' : null,
    ownerId,
  }
}

export function canEditTripRole(role: TripAccessRole | null | undefined): boolean {
  return role === 'owner' || role === 'editor'
}
