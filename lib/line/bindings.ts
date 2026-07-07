import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LineGroupBinding } from '@/lib/types'

type TripRow = { id: string; owner_id: string; invite_token: string | null }
type BindingRow = { line_group_id: string; trip_id: string; write_as_user_id: string; status: string }

export async function bindLineGroupToTrip(input: {
  lineGroupId: string
  tripLinkOrToken: string
}): Promise<{ tripId: string }> {
  const trip = await resolveTrip(input.tripLinkOrToken)
  const admin = createAdminClient()

  await admin
    .from('trip_line_groups')
    .update({ status: 'disabled' })
    .eq('line_group_id', input.lineGroupId)
    .eq('status', 'active')
    .select('id')

  const { error } = await admin
    .from('trip_line_groups')
    .insert({
      line_group_id: input.lineGroupId,
      trip_id: trip.id,
      write_as_user_id: trip.owner_id,
      status: 'active',
    })
    .select('id')
    .single()

  if (error) throw new Error('LINE_BIND_FAILED')
  return { tripId: trip.id }
}

export async function unbindLineGroup(input: { lineGroupId: string }): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('trip_line_groups')
    .update({ status: 'disabled' })
    .eq('line_group_id', input.lineGroupId)
    .eq('status', 'active')
    .select('id')

  if (error) throw new Error('LINE_UNBIND_FAILED')
}

export async function getActiveLineGroupBinding(lineGroupId: string): Promise<LineGroupBinding | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trip_line_groups')
    .select('line_group_id, trip_id, write_as_user_id, status')
    .eq('line_group_id', lineGroupId)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null
  const row = data as BindingRow
  return {
    lineGroupId: row.line_group_id,
    tripId: row.trip_id,
    writeAsUserId: row.write_as_user_id,
  }
}

async function resolveTrip(tripLinkOrToken: string): Promise<TripRow> {
  const tokenOrId = extractTripTokenOrId(tripLinkOrToken)
  const admin = createAdminClient()

  const byInvite = await admin
    .from('trips')
    .select('id, owner_id, invite_token')
    .eq('invite_token', tokenOrId)
    .single()

  if (byInvite.data) return byInvite.data as TripRow

  const byId = await admin
    .from('trips')
    .select('id, owner_id, invite_token')
    .eq('id', tokenOrId)
    .single()

  if (byId.data) return byId.data as TripRow
  throw new Error('INVALID_TRIP_LINK')
}

function extractTripTokenOrId(value: string): string {
  try {
    const url = new URL(value)
    const parts = url.pathname.split('/').filter(Boolean)
    return parts[parts.length - 1] ?? value
  } catch {
    return value.trim()
  }
}
