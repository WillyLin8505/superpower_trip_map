import { detectDayGeoOutliers } from '@/lib/utils/geoOutlier'

type Pt = { id: string; lat: number; lng: number }
function p(id: string, lat: number, lng: number): Pt {
  return { id, lat, lng }
}

// A tight cluster of Tokyo points (within a few km of each other).
const tokyo: Pt[] = [
  p('asakusa', 35.7148, 139.7967),
  p('ueno', 35.7138, 139.7770),
  p('akihabara', 35.6984, 139.7731),
  p('tokyo-stn', 35.6812, 139.7671),
  p('ginza', 35.6717, 139.7650),
]
const osaka = p('dotonbori', 34.6687, 135.5013) // ~400 km from Tokyo
const yokohama = p('yokohama', 35.4437, 139.6380) // ~30 km from Tokyo centre

test('flags a far-away outlier (Osaka mixed into a Tokyo day)', () => {
  const out = detectDayGeoOutliers([...tokyo, osaka])
  expect(out.has('dotonbori')).toBe(true)
  for (const t of tokyo) expect(out.has(t.id)).toBe(false)
})

test('flags nothing on a compact same-city day (no false positives)', () => {
  const out = detectDayGeoOutliers(tokyo)
  expect(out.size).toBe(0)
})

test('returns empty for fewer than 4 places (MAD unstable)', () => {
  const out = detectDayGeoOutliers([tokyo[0], osaka, yokohama])
  expect(out.size).toBe(0)
})

test('does not crash and flags nothing when all points are identical (MAD=0)', () => {
  const same = [p('a', 35.68, 139.76), p('b', 35.68, 139.76), p('c', 35.68, 139.76), p('d', 35.68, 139.76)]
  const out = detectDayGeoOutliers(same)
  expect(out.size).toBe(0)
})

test('flags a far outlier even when the cluster collapses the spread (MAD=0 degenerate)', () => {
  // 5 stops pinned at the exact same spot (e.g. one big complex) → the median absolute
  // deviation is 0. The fallback scale must still flag the far outlier, not divide-by-zero.
  const complex = [
    p('c1', 35.68, 139.76), p('c2', 35.68, 139.76), p('c3', 35.68, 139.76),
    p('c4', 35.68, 139.76), p('c5', 35.68, 139.76),
  ]
  const out = detectDayGeoOutliers([...complex, osaka])
  expect(out.has('dotonbori')).toBe(true)
  for (const c of complex) expect(out.has(c.id)).toBe(false)
})

test('flags multiple far outliers together', () => {
  const out = detectDayGeoOutliers([...tokyo, osaka, yokohama])
  expect(out.has('dotonbori')).toBe(true)
  // Yokohama is ~30km — borderline; the absolute floor should keep near-city points unflagged.
  expect(out.has('ginza')).toBe(false)
})
