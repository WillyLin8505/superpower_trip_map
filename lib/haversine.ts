// Straight-line estimates used when the live Distance Matrix is off (cost mode).
// Roads are not straight lines: apply a circuity factor to the haversine
// distance, then divide by a per-mode urban door-to-door speed. Previously a
// single walking speed (1.4 m/s) was used for EVERY mode, so 開車 legs showed
// walking times (e.g. 「開車 42 分 · 3.5 公里」).
export type EstimateMode = 'walking' | 'driving' | 'transit'

const ROAD_CIRCUITY = 1.3
const MODE_SPEED_MPS: Record<EstimateMode, number> = {
  walking: 1.39,  // ~5 km/h
  driving: 6.94,  // ~25 km/h urban effective (lights, parking)
  transit: 5.0,   // ~18 km/h door-to-door (waits, transfers)
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371000
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

export function haversineSeconds(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  mode: EstimateMode = 'walking'
): number {
  const speed = MODE_SPEED_MPS[mode] ?? MODE_SPEED_MPS.walking
  return Math.round((haversineMeters(a, b) * ROAD_CIRCUITY) / speed)
}
