import { notFound } from 'next/navigation'
import { getTrip } from '@/app/actions/trips'
import { listMembers } from '@/app/actions/members'
import { listCandidates, listArchived } from '@/app/actions/candidates'
import { getTripEstimatedCostUsd } from '@/lib/apiUsageEvents'
import { createClient } from '@/lib/supabase/server'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { MembersPanel } from '@/components/MembersPanel'

export default async function TripPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  const trip = await getTrip(tripId)
  if (!trip) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = user?.id === trip.ownerId
  const canEdit = trip.role === 'owner' || trip.role === 'editor'
  const members = await listMembers(tripId)
  const candidates = canEdit ? await listCandidates(tripId) : []
  const archived = canEdit ? await listArchived(tripId) : []
  const initialCostUsd = canEdit ? await getTripEstimatedCostUsd(tripId) : 0
  return (
    <>
      <MembersPanel tripId={tripId} members={members} isOwner={isOwner} />
      <ItineraryClient
        initial={trip.plan}
        tripId={tripId}
        initialCandidates={candidates}
        initialArchived={archived}
        initialCostUsd={initialCostUsd}
        canEdit={canEdit}
        showCost={canEdit}
      />
    </>
  )
}
