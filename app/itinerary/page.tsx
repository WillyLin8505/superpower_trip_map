import { planItinerary } from '@/app/actions/plan'
import { ItineraryClient } from './ItineraryClient'
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

  return <ItineraryClient initial={plan} />
}
