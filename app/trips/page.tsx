import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listTrips } from '@/app/actions/trips'
import { TripsView } from '@/components/TripsView'

export default async function TripsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/trips')
  const trips = await listTrips()
  return (
    <main>
      <h1 className="max-w-2xl mx-auto px-4 pt-8 text-xl font-semibold">我的行程</h1>
      <TripsView trips={trips} />
    </main>
  )
}
