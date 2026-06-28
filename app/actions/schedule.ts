'use server'
import type { Place, ScheduledPlace, DayItinerary, DistanceMatrix } from '@/lib/types'
import { checkLateExit, checkOutsideHours } from '@/lib/utils/hours'
import { dayDate } from '@/lib/utils/date'
import { DWELL } from '@/lib/placeType'

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60).toString().padStart(2, '0')
  const m = (mins % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function travelSecs(
  aIdx: number,
  bIdx: number,
  matrix: DistanceMatrix,
  placeIds: string[]
): number {
  const i = matrix.indices.indexOf(placeIds[aIdx])
  const j = matrix.indices.indexOf(placeIds[bIdx])
  if (i === -1 || j === -1) return 0
  return matrix.matrix[i][j]
}

export async function schedulePlaces(
  orderedPlaces: Place[],
  distMatrix: DistanceMatrix,
  days: number,
  startDate: string
): Promise<DayItinerary[]> {
  const chunkSize = Math.ceil(orderedPlaces.length / days)
  const dayChunks: Place[][] = Array.from({ length: days }, (_, d) =>
    orderedPlaces.slice(d * chunkSize, (d + 1) * chunkSize)
  )

  return dayChunks.map((chunk, dayIdx) => {
    const dateIso = dayDate(startDate, dayIdx + 1)
    const placeIds = chunk.map((p) => p.placeId)

    // Desserts and accommodation flow freely like attractions (not pinned to meal slots)
    const attractions = chunk.filter((p) => p.type === 'attraction' || p.type === 'dessert' || p.type === 'accommodation')
    const restaurants = chunk.filter((p) => p.type === 'restaurant')

    const lunchRestaurant = restaurants[0] ?? null
    const dinnerRestaurant = restaurants[1] ?? null
    const extraRestaurants = restaurants.slice(2)

    const amAttractions = attractions.slice(0, Math.ceil(attractions.length / 2))
    const pmAttractions = [
      ...attractions.slice(Math.ceil(attractions.length / 2)),
      ...extraRestaurants,
    ]

    const ordered: Place[] = [
      ...amAttractions,
      ...(lunchRestaurant ? [lunchRestaurant] : []),
      ...pmAttractions,
      ...(dinnerRestaurant ? [dinnerRestaurant] : []),
    ]

    let cursor = 9 * 60

    const scheduled: ScheduledPlace[] = ordered.map((place, i) => {
      if (place === lunchRestaurant && cursor < 12 * 60) cursor = 12 * 60
      if (place === dinnerRestaurant && cursor < 18 * 60) cursor = 18 * 60

      const startTime = minsToTime(cursor)
      const durationMin = DWELL[place.type]

      const travelMin =
        i < ordered.length - 1
          ? Math.round(
              travelSecs(
                placeIds.indexOf(place.placeId),
                placeIds.indexOf(ordered[i + 1].placeId),
                distMatrix,
                placeIds
              ) / 60
            )
          : null

      const outsideHours = checkOutsideHours(startTime, place.openingHours, dateIso)
      const lateExit = checkLateExit(startTime, durationMin, place.openingHours, dateIso)
      cursor += durationMin + (travelMin ?? 0)

      return {
        ...place,
        startTime,
        durationMin,
        travelMinToNext: travelMin,
        aiDescription: null,
        outsideHours,
        lateExit,
        startLocked: false,
        durationLocked: false,
      }
    })

    return { day: dayIdx + 1, places: scheduled, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
  })
}
