import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

type TripRow = {
  id: string
  owner_id: string
}

type BindingRow = {
  trip_id: string
  write_as_user_id: string
}

type SupabaseErrorLike = {
  code?: string
  details?: string
  message?: string
}

export async function getActiveLineGroupBinding(lineGroupId: string): Promise<{
  tripId: string
  writeAsUserId: string
} | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_line_groups')
    .select('trip_id, write_as_user_id')
    .eq('line_group_id', lineGroupId)
    .eq('status', 'active')
    .single()

  if (error) {
    if (isNoRowError(error)) return null
    throw new Error('LINE_BIND_ACTIVE_LOOKUP_FAILED')
  }

  if (!data) return null

  const row = data as BindingRow
  return {
    tripId: row.trip_id,
    writeAsUserId: row.write_as_user_id,
  }
}

export async function bindLineGroupToTrip(input: {
  lineGroupId: string
  tripLinkOrToken: string
}): Promise<{ tripId: string } | 'already_bound' | 'not_found'> {
  const activeBinding = await getActiveLineGroupBinding(input.lineGroupId)
  if (activeBinding) return 'already_bound'

  const trip = await resolveTrip(input.tripLinkOrToken)
  if (!trip) return 'not_found'

  const admin = createAdminClient()
  const { error } = await admin.from('trip_line_groups').insert({
    line_group_id: input.lineGroupId,
    trip_id: trip.id,
    write_as_user_id: trip.owner_id,
    status: 'active',
  })

  if (error) {
    if (isDuplicateKeyError(error)) return 'already_bound'
    throw new Error('LINE_BIND_FAILED')
  }

  return { tripId: trip.id }
}

export async function unbindLineGroup(input: {
  lineGroupId: string
}): Promise<'unbound' | 'not_bound'> {
  const activeBinding = await getActiveLineGroupBinding(input.lineGroupId)
  if (!activeBinding) return 'not_bound'

  const admin = createAdminClient()
  const { error } = await admin
    .from('trip_line_groups')
    .update({
      status: 'disabled',
      updated_at: new Date().toISOString(),
    })
    .eq('line_group_id', input.lineGroupId)
    .eq('status', 'active')

  if (error) throw new Error('LINE_UNBIND_FAILED')
  return 'unbound'
}

async function resolveTrip(tripLinkOrToken: string): Promise<TripRow | null> {
  const lookup = extractTripLookupValue(tripLinkOrToken)
  const admin = createAdminClient()
  const column = lookup.kind === 'invite' ? 'invite_token' : 'id'
  const { data, error } = await admin
    .from('trips')
    .select('id, owner_id')
    .eq(column, lookup.value)
    .single()

  if (error) {
    if (isNoRowError(error)) return null
    throw new Error('LINE_BIND_TRIP_LOOKUP_FAILED')
  }

  if (!data) return null
  return data as TripRow
}

function extractTripLookupValue(input: string): { kind: 'invite' | 'trip'; value: string } {
  try {
    const url = new URL(input)
    const parts = url.pathname.split('/').filter(Boolean)
    const joinIndex = parts.indexOf('join')
    const itineraryIndex = parts.indexOf('itinerary')

    if (joinIndex >= 0 && parts[joinIndex + 1]) {
      return { kind: 'invite', value: parts[joinIndex + 1] }
    }

    if (itineraryIndex >= 0 && parts[itineraryIndex + 1]) {
      return { kind: 'trip', value: parts[itineraryIndex + 1] }
    }
  } catch {
    // Plain tokens fall back to invite tokens.
  }

  return { kind: 'invite', value: input.trim() }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (error as SupabaseErrorLike | null)?.code === '23505'
}

function isNoRowError(error: unknown): boolean {
  const candidate = error as SupabaseErrorLike | null
  if (!candidate) return false

  const text = `${candidate.message ?? ''} ${candidate.details ?? ''}`.toLowerCase()
  const isZeroRowText =
    text.includes('0 rows') ||
    text.includes('zero rows') ||
    text.includes('no rows') ||
    text.includes('0 row')

  return candidate.code === 'PGRST116' && isZeroRowText
}
