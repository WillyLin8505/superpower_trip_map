'use server'
import type { Place, TransportMode, DistanceMatrix, LegDefault, DayItinerary } from '@/lib/types'
import { buildDistanceMatrix } from '@/app/actions/directions'
import { haversineMeters } from '@/lib/haversine'
import { pickLegDefault } from '@/lib/utils/legDefault'
import { recalcDay } from '@/lib/utils/clientScheduler'
import { dayDate } from '@/lib/utils/date'
import { runWithTripId } from '@/lib/apiUsageContext'

function legMin(m: DistanceMatrix, i: number): number {
  return Math.round((m.matrix[i]?.[i + 1] ?? 0) / 60)
}
function legDistM(m: DistanceMatrix, i: number): number {
  return Math.round(m.distances?.[i]?.[i + 1] ?? 0)
}

export async function computeLegPlan(orderedPlaces: Place[], tripId?: string): Promise<LegDefault[]> {
  return runWithTripId(tripId, async () => {
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
      out.push(pickLegDefault(
        dist,
        { min: legMin(driving, i), distM: legDistM(driving, i) },
        { min: legMin(transit, i), distM: legDistM(transit, i) },
        { min: legMin(walking, i), distM: legDistM(walking, i) },
      ))
    }
    return out
  })
}

export async function legInfo(
  origin: Place, dest: Place, mode: TransportMode, tripId?: string
): Promise<{ travelMin: number; travelDistanceM: number }> {
  return runWithTripId(tripId, async () => {
    const m = await buildDistanceMatrix([origin, dest], mode)
    return {
      travelMin: Math.round((m.matrix[0]?.[1] ?? 0) / 60),
      travelDistanceM: Math.round(m.distances?.[0]?.[1] ?? 0),
    }
  })
}

export async function applyLegDefaults(
  days: DayItinerary[],
  startDate: string,
  tripId?: string
): Promise<DayItinerary[]> {
  return runWithTripId(tripId, async () => Promise.all(
    days.map(async (day) => {
      const legPlan = await computeLegPlan(day.places)
      const places = day.places.map((p, i) =>
        i < day.places.length - 1
          ? { ...p, legMode: legPlan[i].legMode, travelMinToNext: legPlan[i].travelMin, travelDistanceToNext: legPlan[i].travelDistanceM ?? null }
          : { ...p, legMode: undefined, travelMinToNext: null, travelDistanceToNext: null }
      )
      return recalcDay({ ...day, places }, dayDate(startDate, day.day))
    })
  ))
}
