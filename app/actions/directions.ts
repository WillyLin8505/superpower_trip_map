'use server'
import type { Place, TransportMode, DistanceMatrix } from '@/lib/types'
import { haversineSeconds } from '@/lib/haversine'

const GOOGLE_MODE: Record<TransportMode, string> = {
  driving: 'driving',
  walking: 'walking',
  transit: 'transit',
}

export async function buildDistanceMatrix(
  places: Place[],
  mode: TransportMode
): Promise<DistanceMatrix> {
  const n = places.length
  const indices = places.map((p) => p.placeId)

  if (n > 25) {
    // Fallback: straight-line haversine for all pairs
    const matrix = places.map((a) =>
      places.map((b) => haversineSeconds(a, b))
    )
    return { indices, matrix }
  }

  const origins = places.map((p) => `${p.lat},${p.lng}`).join('|')
  const destinations = origins
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(origins)}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    `&mode=${GOOGLE_MODE[mode]}` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`

  const res = await fetch(url)
  const data = await res.json()

  if (data.status !== 'OK') {
    // Fallback on API error
    const matrix = places.map((a) => places.map((b) => haversineSeconds(a, b)))
    return { indices, matrix }
  }

  const matrix = data.rows.map((row: any) =>
    row.elements.map((el: any) =>
      el.status === 'OK' ? el.duration.value : haversineSeconds(places[0], places[0])
    )
  )
  return { indices, matrix }
}

export async function getDirectionsPolyline(
  waypoints: { lat: number; lng: number }[],
  mode: TransportMode
): Promise<string | null> {
  if (waypoints.length < 2) return null
  const origin = `${waypoints[0].lat},${waypoints[0].lng}`
  const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`
  const middle = waypoints
    .slice(1, -1)
    .map((w) => `${w.lat},${w.lng}`)
    .join('|')
  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    (middle ? `&waypoints=${encodeURIComponent(middle)}` : '') +
    `&mode=${GOOGLE_MODE[mode]}` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.status !== 'OK') return null
  return data.routes[0]?.overview_polyline?.points ?? null
}
