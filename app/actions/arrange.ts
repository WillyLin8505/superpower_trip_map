'use server'
import type { Place, TransportMode, DayArrangeInputs } from '@/lib/types'
import type { CrowdForecast } from '@/lib/crowd/types'
import { buildDistanceMatrix } from '@/app/actions/directions'
import { getCrowdForecast } from '@/lib/crowd'

export async function fetchDayArrangeInputs(
  dayPlaces: Place[],
  mode: TransportMode,
  needCrowd: boolean
): Promise<DayArrangeInputs> {
  const dm = await buildDistanceMatrix(dayPlaces, mode)
  const crowdByPlaceId: Record<string, CrowdForecast> = {}
  if (needCrowd) {
    const forecasts = await Promise.all(dayPlaces.map((p) => getCrowdForecast(p)))
    dayPlaces.forEach((p, i) => { crowdByPlaceId[p.placeId] = forecasts[i] })
  }
  return { indices: dm.indices, matrix: dm.matrix, crowdByPlaceId }
}
