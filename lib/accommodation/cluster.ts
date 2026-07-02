import { haversineSeconds } from '@/lib/haversine'
import { nearestNeighbor, twoOpt, routeCost } from '@/lib/tsp'
import type { Place } from '@/lib/types'

type Geo = { lat: number; lng: number }
function centroid(pts: Geo[]): Geo {
  const n = pts.length
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / n, lng: pts.reduce((s, p) => s + p.lng, 0) / n }
}

export function inferNightOrder(hotels: Place[], attractions: Place[]): number[] {
  if (hotels.length <= 1) return hotels.map((_, i) => i)
  const c = centroid(attractions.length ? attractions : hotels)
  let seed = 0
  let sd = Infinity
  hotels.forEach((h, i) => { const d = haversineSeconds(h, c); if (d < sd) { sd = d; seed = i } })
  const m = hotels.map((a) => hotels.map((b) => haversineSeconds(a, b)))
  return twoOpt(nearestNeighbor(m, seed), m)
}

export function assignHotelsToDays(orderedHotels: Place[], numDays: number): (Place | null)[] {
  const dayHotels: (Place | null)[] = Array.from({ length: numDays }, () => null)
  orderedHotels.forEach((h, j) => {
    const d = Math.min(j, numDays - 1)
    if (dayHotels[d] === null) dayHotels[d] = h
  })
  return dayHotels
}

export function clusterAttractionsToDays(
  attractions: Place[],
  dayHotels: (Place | null)[],
  budgetMin: number,
  dwellOf: (p: Place) => number
): Place[][] {
  const N = dayHotels.length
  const buckets: Place[][] = Array.from({ length: N }, () => [])
  const hotelDays = dayHotels
    .map((h, d) => ({ h, d }))
    .filter((x): x is { h: Place; d: number } => x.h !== null)
  if (hotelDays.length === 0) { buckets[0] = [...attractions]; return buckets }

  const home: number[][] = Array.from({ length: N }, () => [])
  attractions.forEach((a, idx) => {
    let bestDay = hotelDays[0].d
    let bd = Infinity
    hotelDays.forEach(({ h, d }) => { const dist = haversineSeconds(a, h); if (dist < bd) { bd = dist; bestDay = d } })
    home[bestDay].push(idx)
  })

  const received: number[][] = Array.from({ length: N }, () => [])
  for (let d = 0; d < N; d++) {
    received[d].forEach((idx) => buckets[d].push(attractions[idx]))
    const hotel = dayHotels[d]
    const queue = home[d].slice()
    if (hotel) {
      queue.sort((x, y) => {
        const dx = haversineSeconds(attractions[x], hotel)
        const dy = haversineSeconds(attractions[y], hotel)
        return dx - dy || attractions[x].placeId.localeCompare(attractions[y].placeId)
      })
    }
    let load = received[d].reduce((s, idx) => s + dwellOf(attractions[idx]), 0)
    const isLast = d === N - 1
    for (const idx of queue) {
      const dwell = dwellOf(attractions[idx])
      if (!isLast && load + dwell > budgetMin) {
        received[d + 1].push(idx)
      } else {
        buckets[d].push(attractions[idx]); load += dwell
      }
    }
  }
  return buckets
}

export function routeDay(prevHotel: Place | null, dayAttractions: Place[], thisHotel: Place | null): Place[] {
  if (dayAttractions.length === 0) return thisHotel ? [thisHotel] : []
  const nodes: Place[] = [
    ...(prevHotel ? [prevHotel] : []),
    ...dayAttractions,
    ...(thisHotel ? [thisHotel] : []),
  ]
  const n = nodes.length
  const m = nodes.map((a) => nodes.map((b) => haversineSeconds(a, b)))
  const hasStart = !!prevHotel
  const hasEnd = !!thisHotel
  const startIdx = hasStart ? 0 : -1
  const endIdx = hasEnd ? n - 1 : -1
  const middle: number[] = []
  for (let i = 0; i < n; i++) if (i !== startIdx && i !== endIdx) middle.push(i)

  const order: number[] = []
  const visited = new Set<number>()
  let cur = hasStart ? startIdx : middle[0]
  order.push(cur); visited.add(cur)
  while (visited.size < (hasStart ? 1 : 0) + middle.length) {
    let best = -1
    let bd = Infinity
    for (const j of middle) if (!visited.has(j) && m[cur][j] < bd) { best = j; bd = m[cur][j] }
    if (best < 0) break
    order.push(best); visited.add(best); cur = best
  }
  if (hasEnd) order.push(endIdx)

  const posHi = order.length - 1 - (hasEnd ? 1 : 0)
  let best = [...order]
  let improved = true
  while (improved) {
    improved = false
    for (let i = Math.max(1, hasStart ? 1 : 0); i <= posHi; i++) {
      for (let j = i + 1; j <= posHi; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        if (routeCost(cand, m) < routeCost(best, m)) { best = cand; improved = true }
      }
    }
  }
  return best.map((i) => nodes[i]).filter((pl) => pl !== prevHotel)
}
