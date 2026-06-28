// lib/crowd/types.ts
export type CrowdLevel = 'low' | 'medium' | 'high'
export type CrowdSource = 'besttime' | 'heuristic'

export interface CrowdForecast {
  source: CrowdSource
  /** weekly[day][hour]; day 0=Mon..6=Sun; hour 0..23; 0–100 relative, or null = no data / closed */
  weekly: (number | null)[][]
  fetchedAt: string
  venueId?: string
}

const LOW_MAX = 40
const HIGH_MIN = 70

export function levelAt(forecast: CrowdForecast, day: number, hour: number): CrowdLevel | null {
  const v = forecast.weekly[day]?.[hour]
  if (v === null || v === undefined) return null
  if (v < LOW_MAX) return 'low'
  if (v < HIGH_MIN) return 'medium'
  return 'high'
}
