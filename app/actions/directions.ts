'use server'
import type { Place, TransportMode, DistanceMatrix } from '@/lib/types'
import { haversineSeconds, haversineMeters } from '@/lib/haversine'

const GOOGLE_MODE: Record<TransportMode, string> = {
  driving: 'driving',
  walking: 'walking',
  transit: 'transit',
}

export async function buildDistanceMatrix(
  places: Place[],
  mode: TransportMode
): Promise<DistanceMatrix> {
  // Fix 4: Early return for empty array
  if (places.length === 0) return { indices: [], matrix: [], distances: [] }

  const n = places.length
  const indices = places.map((p) => p.placeId)

  const haversineMatrix = () =>
    places.map((a) => places.map((b) => haversineSeconds(a, b)))
  const haversineDistanceMatrix = () =>
    places.map((a) => places.map((b) => haversineMeters(a, b)))

  if (n > 25) {
    // Fallback: straight-line haversine for all pairs
    return { indices, matrix: haversineMatrix(), distances: haversineDistanceMatrix() }
  }

  const origins = places.map((p) => `${p.lat},${p.lng}`).join('|')
  const destinations = origins
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${encodeURIComponent(origins)}` +
    `&destinations=${encodeURIComponent(destinations)}` +
    `&mode=${GOOGLE_MODE[mode]}` +
    `&key=${process.env.GOOGLE_MAPS_API_KEY}`

  // Fix 3: Wrap fetch block in try-catch to handle network/JSON errors
  try {
    const res = await fetch(url)

    // Fix 2: Check res.ok before parsing JSON
    if (!res.ok) return { indices, matrix: haversineMatrix(), distances: haversineDistanceMatrix() }

    const data = await res.json()

    if (data.status !== 'OK') {
      // Fallback on API error
      return { indices, matrix: haversineMatrix(), distances: haversineDistanceMatrix() }
    }

    // Fix 1: Track row index i and column index j for correct haversine fallback
    interface DMatrixElement { status: string; duration: { value: number }; distance?: { value: number } }
    interface DMatrixRow { elements: DMatrixElement[] }
    const matrix = data.rows.map((row: DMatrixRow, i: number) =>
      row.elements.map((el: DMatrixElement, j: number) =>
        el.status === 'OK' ? el.duration.value : haversineSeconds(places[i], places[j])
      )
    )
    const distances = data.rows.map((row: DMatrixRow, i: number) =>
      row.elements.map((el: DMatrixElement, j: number) =>
        el.status === 'OK' && el.distance ? el.distance.value : haversineMeters(places[i], places[j])
      )
    )
    return { indices, matrix, distances }
  } catch {
    // Fallback on network failure or JSON parse error
    return { indices, matrix: haversineMatrix(), distances: haversineDistanceMatrix() }
  }
}

