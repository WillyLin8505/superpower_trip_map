import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTripShareSettings } from '@/app/actions/share'
import { createClient } from '@/lib/supabase/server'
import { ShareSettingsClient } from '@/components/ShareSettingsClient'

export default async function TripShareSettingsPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/itinerary/${tripId}/share`)}`)

  try {
    const settings = await getTripShareSettings(tripId)
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
        <Link href={`/itinerary/${tripId}`} className="text-sm text-clay-deep hover:underline">
          ← 回到行程
        </Link>
        <ShareSettingsClient initialSettings={settings} />
      </main>
    )
  } catch {
    notFound()
  }
}
