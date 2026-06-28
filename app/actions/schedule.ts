'use server'
import type { Place, ScheduledPlace, DayItinerary, DistanceMatrix } from '@/lib/types'
import { checkLateExit, checkOutsideHours } from '@/lib/utils/hours'
import { dayDate } from '@/lib/utils/date'
import { DWELL } from '@/lib/placeType'
import { inferNightOrder, assignHotelsToDays, clusterAttractionsToDays, routeDay } from '@/lib/accommodation/cluster'

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

// 把 am/lunch/pm/dinner 排序邏輯抽成純函式，讓 chunk 路徑共用
function mealOrder(chunk: Place[]): Place[] {
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

  return [
    ...amAttractions,
    ...(lunchRestaurant ? [lunchRestaurant] : []),
    ...pmAttractions,
    ...(dinnerRestaurant ? [dinnerRestaurant] : []),
  ]
}

// 把 cursor + snap + warnings + map 成 ScheduledPlace 的邏輯抽成共用 helper。
// 餐別 snap 以「迭代中遇到的第 1/2 個 type==='restaurant'」觸發，
// 與舊有 lunchRestaurant/dinnerRestaurant 參考等效（chunk 路徑），
// 且在 cluster 路徑（無外部參考）同樣適用。
function fillDay(orderedPlaces: Place[], dateIso: string, distMatrix: DistanceMatrix): ScheduledPlace[] {
  const placeIds = orderedPlaces.map((p) => p.placeId)
  // 伺服器端初次排程固定以 09:00 起算（設計如此）；每天的 dayStart 活動時間窗在 client recalc 路徑（clientScheduler）才套用
  let cursor = 9 * 60
  let restaurantsSeen = 0

  return orderedPlaces.map((place, i) => {
    if (place.type === 'restaurant') {
      if (restaurantsSeen === 0 && cursor < 12 * 60) cursor = 12 * 60
      if (restaurantsSeen === 1 && cursor < 18 * 60) cursor = 18 * 60
      restaurantsSeen++
    }

    const startTime = minsToTime(cursor)
    const durationMin = DWELL[place.type]

    const travelMin =
      i < orderedPlaces.length - 1
        ? Math.round(
            travelSecs(
              placeIds.indexOf(place.placeId),
              placeIds.indexOf(orderedPlaces[i + 1].placeId),
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
}

const DAY_BUDGET_MIN = 720

export async function schedulePlaces(
  orderedPlaces: Place[],
  distMatrix: DistanceMatrix,
  days: number,
  startDate: string
): Promise<DayItinerary[]> {
  const hotels = orderedPlaces.filter((p) => p.type === 'accommodation')
  let dayOrderedPlaces: Place[][]

  if (hotels.length > 0) {
    const nonHotels = orderedPlaces.filter((p) => p.type !== 'accommodation')
    const nightOrderIdx = inferNightOrder(hotels, nonHotels)
    const orderedHotels = nightOrderIdx.map((i) => ({ ...hotels[i], nightIndex: 0 }))
    orderedHotels.forEach((h, j) => { h.nightIndex = j + 1 })
    const dayHotels = assignHotelsToDays(orderedHotels, days)
    const buckets = clusterAttractionsToDays(nonHotels, dayHotels, DAY_BUDGET_MIN, (p) => DWELL[p.type])
    dayOrderedPlaces = dayHotels.map((thisHotel, d) => {
      const prevHotel = d > 0 ? dayHotels[d - 1] : null
      return routeDay(prevHotel, buckets[d], thisHotel)
    })
    // Surface accommodations beyond day capacity (hotels > days) on the last day rather than dropping them
    const assignedIds = new Set(
      dayHotels.filter((h): h is Place => h !== null).map((h) => h.placeId)
    )
    const overflowHotels = orderedHotels.filter((h) => !assignedIds.has(h.placeId))
    if (overflowHotels.length > 0) {
      dayOrderedPlaces[days - 1] = [...dayOrderedPlaces[days - 1], ...overflowHotels]
    }
  } else {
    // 既有 chunk 路徑：產生每天 ordered（沿用原 am/lunch/pm/dinner 排序）
    const chunkSize = Math.ceil(orderedPlaces.length / days)
    dayOrderedPlaces = Array.from({ length: days }, (_, d) =>
      mealOrder(orderedPlaces.slice(d * chunkSize, (d + 1) * chunkSize))
    )
  }

  return dayOrderedPlaces.map((dayPlaces, dayIdx) => {
    const dateIso = dayDate(startDate, dayIdx + 1)
    const places = fillDay(dayPlaces, dateIso, distMatrix)
    return { day: dayIdx + 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
  })
}
