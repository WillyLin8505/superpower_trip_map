'use server'
import type { Place, TransportMode, PlanResult } from '@/lib/types'
import { getPlaceDetails } from './places'
import { buildDistanceMatrix } from './directions'
import { optimizeRoute } from './optimize'
import { schedulePlaces } from './schedule'
import { generateDaySummaries } from './ai'

export async function planItinerary(
  places: Place[],
  days: number,
  mode: TransportMode,
  startDate: string
): Promise<PlanResult> {
  // Enrich with full details (opening hours, rating, etc.)
  const enriched = await Promise.all(
    places.map(async (p) => {
      const details = await getPlaceDetails(p.placeId)
      return details ? { ...details, id: p.id, type: p.type } : p
    })
  )

  const matrix = await buildDistanceMatrix(enriched, mode)
  const orderedIds = await optimizeRoute(matrix)
  const ordered = orderedIds
    .map((pid) => enriched.find((p) => p.placeId === pid)!)
    .filter(Boolean)

  const dayItineraries = await schedulePlaces(ordered, matrix, days, startDate)

  const enrichedDays = await generateDaySummaries(dayItineraries)
  return { days: enrichedDays, transportMode: mode, startDate }
}
