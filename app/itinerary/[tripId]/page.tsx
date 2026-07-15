import { notFound } from 'next/navigation'
import { getTrip } from '@/app/actions/trips'
import { listMembers } from '@/app/actions/members'
import { listCandidates, listArchived } from '@/app/actions/candidates'
import { getTripEstimatedCostUsd } from '@/lib/apiUsageEvents'
import { createClient } from '@/lib/supabase/server'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'
import { MembersPanel } from '@/components/MembersPanel'

export default async function TripPage({ params }: { params: { tripId: string } }) {
  const trip = await getTrip(params.tripId)
  if (!trip) notFound()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const isOwner = user?.id === trip.ownerId
  const members = await listMembers(params.tripId)
  const candidates = await listCandidates(params.tripId)
  const archived = await listArchived(params.tripId)
  const initialCostUsd = await getTripEstimatedCostUsd(params.tripId)
  return (
    <>
      <MembersPanel tripId={params.tripId} members={members} isOwner={isOwner} />
      <ItineraryClient initial={trip.plan} tripId={params.tripId} initialCandidates={candidates} initialArchived={archived} initialCostUsd={initialCostUsd} />
    </>
  )
}
