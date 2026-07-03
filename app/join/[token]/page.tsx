import Link from 'next/link'
import { redirect } from 'next/navigation'
import { joinTrip } from '@/app/actions/members'
import { createClient } from '@/lib/supabase/server'

type JoinPageProps = {
  params: {
    token: string
  }
}

export default async function JoinPage({ params }: JoinPageProps) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${params.token}`)}`)
  }

  try {
    const { tripId } = await joinTrip(params.token)
    redirect(`/itinerary/${tripId}`)
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_INVITE') {
      return (
        <main className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-16 text-center">
          <p className="text-gray-700">{'\u9080\u8acb\u9023\u7d50\u7121\u6548\u6216\u5df2\u5931\u6548'}</p>
          <Link href="/trips" className="text-sm underline">
            {'\u56de\u5230\u6211\u7684\u884c\u7a0b'}
          </Link>
        </main>
      )
    }

    throw error
  }
}
