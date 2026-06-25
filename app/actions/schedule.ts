'use server'
import type { Place, ScheduledPlace, DayItinerary, DistanceMatrix } from '@/lib/types'

const DWELL: Record<string, number> = { attraction: 90, restaurant: 60 }
const DAY_START = 9 * 60   // 09:00 in minutes

function isOutsideHours(startTime: string, openingHours: string[] | null): boolean {
  if (!openingHours) return false
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = days[new Date().getDay()]
  const todayHours = openingHours.find((h) => h.startsWith(today))
  if (!todayHours) return false
  // Parse "Monday: 9:00 AM – 5:00 PM"
  const match = todayHours.match(/(\d+:\d+\s*[AP]M)\s*[–-]\s*(\d+:\d+\s*[AP]M)/)
  if (!match) return false
  const toMins = (t: string) => {
    const [time, period] = t.trim().split(/\s+/)
    const [h, m] = time.split(':').map(Number)
    return ((period === 'PM' && h !== 12 ? h + 12 : period === 'AM' && h === 12 ? 0 : h) * 60) + m
  }
  const openMin = toMins(match[1])
  const closeMin = toMins(match[2])
  const [sh, sm] = startTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  return startMin < openMin || startMin >= closeMin
}

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
  days: number
): Promise<DayItinerary[]> {
  // Split evenly across days
  const chunkSize = Math.ceil(orderedPlaces.length / days)
  const dayChunks: Place[][] = Array.from({ length: days }, (_, d) =>
    orderedPlaces.slice(d * chunkSize, (d + 1) * chunkSize)
  )

  return dayChunks.map((chunk, dayIdx) => {
    const placeIds = chunk.map((p) => p.placeId)

    // Separate attractions and restaurants
    const attractions = chunk.filter((p) => p.type === 'attraction')
    const restaurants = chunk.filter((p) => p.type === 'restaurant')

    // Assign meal slots: first restaurant → lunch, second → dinner
    const lunchRestaurant = restaurants[0] ?? null
    const dinnerRestaurant = restaurants[1] ?? null
    const extraRestaurants = restaurants.slice(2)

    // Build ordered schedule: AM attractions → lunch → PM attractions → dinner
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

    let cursor = DAY_START

    const scheduled: ScheduledPlace[] = ordered.map((place, i) => {
      // Force meal windows
      if (place === lunchRestaurant && cursor < 12 * 60) cursor = 12 * 60
      if (place === dinnerRestaurant && cursor < 18 * 60) cursor = 18 * 60

      // If there are no attractions and only one restaurant, schedule at lunch
      // (lunchRestaurant handles first restaurant; dinnerRestaurant handles second)

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

      const outsideHours = isOutsideHours(startTime, place.openingHours)
      cursor += durationMin + (travelMin ?? 0)

      return {
        ...place,
        startTime,
        durationMin,
        travelMinToNext: travelMin,
        aiDescription: null,
        outsideHours,
      }
    })

    return { day: dayIdx + 1, places: scheduled, aiSummary: null }
  })
}
