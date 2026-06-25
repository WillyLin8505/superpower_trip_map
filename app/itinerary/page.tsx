import { planItinerary } from '@/app/actions/plan'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { Place, TransportMode } from '@/lib/types'

interface Props {
  searchParams: { places?: string; days?: string; mode?: string }
}

export default async function ItineraryPage({ searchParams }: Props) {
  let places: Place[] = []
  try {
    places = JSON.parse(searchParams.places ?? '[]')
  } catch {
    places = []
  }
  const days = Number(searchParams.days ?? 2)
  const mode = (searchParams.mode ?? 'driving') as TransportMode

  const plan = await planItinerary(places, days, mode)

  return (
    <main className="max-w-5xl mx-auto px-4 py-10 flex gap-8">
      <div className="flex-1 min-w-0">
        <a href="/" className="text-blue-600 text-sm mb-6 inline-block">← 重新規劃</a>
        {plan.days.map((day) => (
          <ItineraryDay key={day.day} day={day} />
        ))}
      </div>
      <div className="w-96 shrink-0 sticky top-4 h-[600px] rounded-xl overflow-hidden border border-gray-200">
        <p className="p-4 text-gray-400 text-sm">地圖（下一個任務加入）</p>
      </div>
    </main>
  )
}
