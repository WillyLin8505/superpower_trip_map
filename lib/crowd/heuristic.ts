// lib/crowd/heuristic.ts
import type { Place } from '@/lib/types'
import type { CrowdForecast } from './types'

type Curve = number[][] // [day 0..6][hour 0..23], multiplier 0..1

function flat(v: number): Curve {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => v))
}

function restaurantCurve(): Curve {
  const c = flat(0.15)
  const peaks: [number, number][] = [[11, 0.6], [12, 0.95], [13, 0.7], [17, 0.55], [18, 0.9], [19, 1.0], [20, 0.7]]
  for (let d = 0; d < 7; d++) {
    const weekend = d >= 5 ? 1.1 : 1
    for (const [h, v] of peaks) c[d][h] = Math.min(1, v * weekend)
  }
  return c
}

function dessertCurve(): Curve {
  const c = flat(0.2)
  for (let d = 0; d < 7; d++) for (let h = 14; h <= 17; h++) c[d][h] = d >= 5 ? 0.9 : 0.6
  return c
}

function attractionCurve(): Curve {
  const c = flat(0.2)
  for (let d = 0; d < 7; d++) {
    const weekend = d >= 5
    for (let h = 10; h <= 16; h++) c[d][h] = weekend ? 0.9 : 0.55
  }
  return c
}

const CURVES: Record<string, Curve> = {
  restaurant: restaurantCurve(),
  dessert: dessertCurve(),
  attraction: attractionCurve(),
}

function ratingFactor(rating: number | null): number {
  if (rating === null) return 1
  return Math.max(0.8, Math.min(1.2, 1 + (rating - 3.5) * 0.1))
}

function toMin(t: string): number | null {
  const ampm = t.trim().match(/^(\d+):(\d+)\s*([AP]M)$/i)
  if (ampm) {
    let h = parseInt(ampm[1], 10)
    const m = parseInt(ampm[2], 10)
    const p = ampm[3].toUpperCase()
    if (p === 'PM' && h !== 12) h += 12
    if (p === 'AM' && h === 12) h = 0
    return h * 60 + m
  }
  const plain = t.trim().match(/^(\d+):(\d+)$/)
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10)
  return null
}

/** [openMin, closeMin] for the day, or null = unknown (do not gate). [0,0] = closed all day. */
function dayWindow(entry: string | undefined): [number, number] | null {
  if (!entry) return null
  if (/closed|休息|不營業/i.test(entry)) return [0, 0]
  const rest = entry.replace(/^[^:：]+[：:]/, '').trim()
  const m = rest.match(/^(.+?)\s*[–-]\s*(.+)$/)
  if (!m) return null
  const o = toMin(m[1])
  const c = toMin(m[2])
  if (o === null || c === null) return null
  return [o, c]
}

export function estimateCrowd(place: Place): CrowdForecast {
  const weekly: (number | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => null as number | null)
  )

  if (place.type !== 'accommodation') {
    const curve = CURVES[place.type] ?? CURVES.attraction
    const rf = ratingFactor(place.rating)
    for (let d = 0; d < 7; d++) {
      const win = dayWindow(place.openingHours?.[d])
      for (let h = 0; h < 24; h++) {
        if (win) {
          const [o, c] = win
          if (o === c) { weekly[d][h] = null; continue }          // closed all day
          if (c > o && !(h * 60 >= o && h * 60 < c)) { weekly[d][h] = null; continue } // outside same-day window
          // c < o (overnight): do not gate
        }
        weekly[d][h] = Math.round(Math.min(100, curve[d][h] * 100 * rf))
      }
    }
  }

  return { source: 'heuristic', weekly, fetchedAt: new Date().toISOString() }
}
