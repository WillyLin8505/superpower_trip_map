'use server'

import type { TripMember } from '@/lib/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

type TripInviteRow = {
  id: string
  owner_id: string
}

type TripOwnerRow = {
  owner_id: string
  invite_token: string | null
}

type TripVisibilityRow = {
  id: string
}

type TripMemberRow = {
  user_id: string
  role: string
}

type AuthProfile = {
  email?: string
  user_metadata?: {
    name?: string
    full_name?: string
    avatar_url?: string
  }
}

async function requireUserId(): Promise<string> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('NOT_AUTHENTICATED')
  return user.id
}

async function requireOwner(
  tripId: string,
  userId: string,
): Promise<{ inviteToken: string | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .select('owner_id, invite_token')
    .eq('id', tripId)
    .single()

  if (error || !data) throw new Error('TRIP_NOT_FOUND')

  const trip = data as TripOwnerRow
  if (trip.owner_id !== userId) throw new Error('NOT_OWNER')

  return { inviteToken: trip.invite_token }
}

async function persistInviteToken(tripId: string, ownerId: string, token: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .update({ invite_token: token })
    .eq('id', tripId)
    .eq('owner_id', ownerId)
    .select('id')

  if (error || !data?.length) throw new Error('INVITE_UPDATE_FAILED')
}

export async function joinTrip(token: string): Promise<{ tripId: string }> {
  const userId = await requireUserId()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('trips')
    .select('id, owner_id')
    .eq('invite_token', token)
    .single()

  if (error || !data) throw new Error('INVALID_INVITE')

  const trip = data as TripInviteRow
  if (trip.owner_id === userId) return { tripId: trip.id }

  const { error: insertError } = await admin
    .from('trip_members')
    .insert({ trip_id: trip.id, user_id: userId, role: 'editor' })

  if (insertError && insertError.code !== '23505') {
    throw new Error('JOIN_TRIP_FAILED')
  }

  return { tripId: trip.id }
}

export async function getInviteLink(tripId: string): Promise<{ token: string }> {
  const userId = await requireUserId()
  const { inviteToken } = await requireOwner(tripId, userId)
  if (inviteToken) return { token: inviteToken }

  const token = crypto.randomUUID()
  await persistInviteToken(tripId, userId, token)
  return { token }
}

export async function rotateInvite(tripId: string): Promise<{ token: string }> {
  const userId = await requireUserId()
  await requireOwner(tripId, userId)

  const token = crypto.randomUUID()
  await persistInviteToken(tripId, userId, token)
  return { token }
}

export async function listMembers(tripId: string): Promise<TripMember[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: visibleTrip } = await supabase
    .from('trips')
    .select('id')
    .eq('id', tripId)
    .single()

  if (!(visibleTrip as TripVisibilityRow | null)?.id) return []

  const admin = createAdminClient()
  const { data: ownerTrip } = await admin
    .from('trips')
    .select('owner_id')
    .eq('id', tripId)
    .single()

  const ownerId = (ownerTrip as Pick<TripOwnerRow, 'owner_id'> | null)?.owner_id
  if (!ownerId) return []

  const { data: membershipRows } = await admin
    .from('trip_members')
    .select('user_id, role')
    .eq('trip_id', tripId)

  const participantIds = [ownerId, ...((membershipRows as TripMemberRow[] | null) ?? []).map((row) => row.user_id)]
  const members: TripMember[] = []

  for (const participantId of participantIds) {
    const { data } = await admin.auth.admin.getUserById(participantId)
    const resolvedUser = data.user as AuthProfile | null
    const metadata = resolvedUser?.user_metadata

    members.push({
      userId: participantId,
      name: metadata?.name ?? metadata?.full_name ?? resolvedUser?.email ?? 'Unknown user',
      avatarUrl: metadata?.avatar_url ?? null,
      role: participantId === ownerId ? 'owner' : 'editor',
      isSelf: participantId === user.id,
    })
  }

  return members
}

export async function removeMember(tripId: string, userId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', userId)

  if (error) throw new Error('REMOVE_MEMBER_FAILED')
}

export async function leaveTrip(tripId: string): Promise<void> {
  const currentUserId = await requireUserId()
  const supabase = createClient()
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('trip_id', tripId)
    .eq('user_id', currentUserId)

  if (error) throw new Error('LEAVE_TRIP_FAILED')
}
