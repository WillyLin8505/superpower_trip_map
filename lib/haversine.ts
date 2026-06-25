const WALKING_SPEED_MPS = 1.4   // 5 km/h

export function haversineSeconds(
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
  const metres = R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return Math.round(metres / WALKING_SPEED_MPS)
}
