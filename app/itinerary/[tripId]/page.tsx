import { notFound } from 'next/navigation'
import { getTrip } from '@/app/actions/trips'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

export default async function TripPage({ params }: { params: { tripId: string } }) {
  const trip = await getTrip(params.tripId)
  if (!trip) notFound()
  return <ItineraryClient initial={trip.plan} tripId={params.tripId} />
}
