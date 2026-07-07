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
          <p className="text-gray-700">邀請連結無效或已失效</p>
          <Link href="/trips" className="text-sm underline">
            回到我的行程
          </Link>
        </main>
      )
    }

    throw error
  }
}
