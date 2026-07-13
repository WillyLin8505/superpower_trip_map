'use server'
import type { Place, TransportMode, LegDefault, DayItinerary } from '@/lib/types'
import { buildDistanceMatrix } from '@/app/actions/directions'
import { haversineMeters } from '@/lib/haversine'
import { pickLegDefault, WALK_THRESHOLD_M } from '@/lib/utils/legDefault'
import { recalcDay } from '@/lib/utils/clientScheduler'
import { dayDate } from '@/lib/utils/date'

export async function computeLegPlan(orderedPlaces: Place[]): Promise<LegDefault[]> {
  const n = orderedPlaces.length
  if (n < 2) return []
  const ZERO = { min: 0, distM: 0 }
  // Only request the mode(s) pickLegDefault actually needs per leg:
  //   dist <= WALK_THRESHOLD_M → walking only; otherwise → driving + transit (never walking).
  // Each leg is a 1-element Distance Matrix call that caches by coords+mode, instead of
  // building 3 full N×N matrices per day (billed ~3·(N-1) elements vs 3·N²).
  return Promise.all(
    Array.from({ length: n - 1 }, async (_, i): Promise<LegDefault> => {
      const a = orderedPlaces[i], b = orderedPlaces[i + 1]
      const dist = haversineMeters(a, b)
      if (dist <= WALK_THRESHOLD_M) {
        const w = await legInfo(a, b, 'walking')
        return pickLegDefault(dist, ZERO, ZERO, { min: w.travelMin, distM: w.travelDistanceM })
      }
      const [d, t] = await Promise.all([legInfo(a, b, 'driving'), legInfo(a, b, 'transit')])
      return pickLegDefault(
        dist,
        { min: d.travelMin, distM: d.travelDistanceM },
        { min: t.travelMin, distM: t.travelDistanceM },
        ZERO,
      )
    })
  )
}

export async function legInfo(
  origin: Place, dest: Place, mode: TransportMode
): Promise<{ travelMin: number; travelDistanceM: number }> {
  const m = await buildDistanceMatrix([origin, dest], mode)
  return {
    travelMin: Math.round((m.matrix[0]?.[1] ?? 0) / 60),
    travelDistanceM: Math.round(m.distances?.[0]?.[1] ?? 0),
  }
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
          ? { ...p, legMode: legPlan[i].legMode, travelMinToNext: legPlan[i].travelMin, travelDistanceToNext: legPlan[i].travelDistanceM ?? null }
          : { ...p, legMode: undefined, travelMinToNext: null, travelDistanceToNext: null }
      )
      return recalcDay({ ...day, places }, dayDate(startDate, day.day))
    })
  )
}
