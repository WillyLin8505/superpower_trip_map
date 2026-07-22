import { notFound } from 'next/navigation'
import { getSharedTrip } from '@/app/actions/share'
import { ItineraryClient } from '@/app/itinerary/ItineraryClient'

export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const trip = await getSharedTrip(token)
  if (!trip) notFound()

  return (
    <>
      <section className="mx-auto mt-6 max-w-5xl rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
        <span className="font-medium text-ink">{trip.title}</span>
        <span className="ml-2">
          {trip.canEdit ? '分享連結：可編輯' : '分享連結：只可觀看'}
        </span>
      </section>
      <ItineraryClient
        initial={trip.plan}
        tripId={trip.tripId}
        shareToken={token}
        canEdit={trip.canEdit}
        showCost={false}
        personalPanelsEnabled={false}
      />
    </>
  )
}
