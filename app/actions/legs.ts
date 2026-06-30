'use server'
import type { Place, TransportMode, DistanceMatrix, LegDefault, DayItinerary } from '@/lib/types'
import { buildDistanceMatrix } from '@/app/actions/directions'
import { haversineMeters } from '@/lib/haversine'
import { pickLegDefault } from '@/lib/utils/legDefault'
import { recalcDay } from '@/lib/utils/clientScheduler'
import { dayDate } from '@/lib/utils/date'

function legMin(m: DistanceMatrix, i: number): number {
  return Math.round((m.matrix[i]?.[i + 1] ?? 0) / 60)
}

export async function computeLegPlan(orderedPlaces: Place[]): Promise<LegDefault[]> {
  const n = orderedPlaces.length
  if (n < 2) return []
  const [driving, walking, transit] = await Promise.all([
    buildDistanceMatrix(orderedPlaces, 'driving'),
    buildDistanceMatrix(orderedPlaces, 'walking'),
    buildDistanceMatrix(orderedPlaces, 'transit'),
  ])
  const out: LegDefault[] = []
  for (let i = 0; i < n - 1; i++) {
    const dist = haversineMeters(orderedPlaces[i], orderedPlaces[i + 1])
    out.push(pickLegDefault(dist, legMin(driving, i), legMin(transit, i), legMin(walking, i)))
  }
  return out
}

export async function legDuration(origin: Place, dest: Place, mode: TransportMode): Promise<number> {
  const m = await buildDistanceMatrix([origin, dest], mode)
  return Math.round((m.matrix[0]?.[1] ?? 0) / 60)
}

export async function applyLegDefaults(
  days: DayItinerary[],
  startDate: string
): Promise<DayItinerary[]> {
  return Promise.all(
    days.map(async (day) => {
      const legPlan = await computeLegPlan(day.places)
      const places = day.places.map((p, i) =>
        i < day.places.length - 1
          ? { ...p, legMode: legPlan[i].legMode, travelMinToNext: legPlan[i].travelMin }
          : { ...p, legMode: undefined, travelMinToNext: null }
      )
      return recalcDay({ ...day, places }, dayDate(startDate, day.day))
    })
  )
}
