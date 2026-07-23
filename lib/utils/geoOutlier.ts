import { haversineMeters } from '@/lib/haversine'

// Day-level geographic outlier detection (backlog #1). Flags places that sit far
// from the rest of the SAME day — e.g. 道頓堀 (Osaka) mixed into a Tokyo day.
// Robust to the outlier skewing the centre by using median lat/lng + median/MAD
// (the mean would be dragged toward the very outlier we're hunting). An absolute
// floor keeps normal within-city variation from ever tripping a flag.

type GeoPoint = { id: string; lat: number; lng: number }

const OUTLIER_Z = 3.5            // modified z-score threshold (standard)
const OUTLIER_FLOOR_M = 30_000   // never flag a point within ~30 km of the day centre
const MAD_K = 0.6745             // MAD → σ estimate (0.6745 = Φ⁻¹(0.75))
const MEANAD_K = 0.7979          // mean-abs-dev → σ estimate (√(2/π)); used when MAD degenerates to 0

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Returns the set of place `id`s (unique card ids) that are geographic outliers
 * for this day. Days with fewer than 4 places return an empty set (MAD is
 * unstable on tiny samples).
 */
export function detectDayGeoOutliers<T extends GeoPoint>(places: T[]): Set<string> {
  const outliers = new Set<string>()
  if (places.length < 4) return outliers

  const centre = {
    lat: median(places.map((p) => p.lat)),
    lng: median(places.map((p) => p.lng)),
  }
  const dists = places.map((p) => haversineMeters(p, centre))
  const m = median(dists)
  const absDev = dists.map((d) => Math.abs(d - m))
  const mad = median(absDev)
  // Modified z-score scale. MAD is the robust default; when it degenerates to 0
  // (half or more of the points share a distance) fall back to the mean absolute
  // deviation, which only collapses to 0 when every point is equidistant.
  const scale = mad > 0 ? mad / MAD_K : (absDev.reduce((s, x) => s + x, 0) / absDev.length) / MEANAD_K

  places.forEach((p, i) => {
    const d = dists[i]
    if (d <= OUTLIER_FLOOR_M) return // within-city jitter never flags
    if (scale === 0) return          // all points equidistant from the centre → no outlier
    const z = (d - m) / scale
    if (z > OUTLIER_Z) outliers.add(p.id)
  })
  return outliers
}
