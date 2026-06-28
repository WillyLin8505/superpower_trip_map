// lib/crowd/besttime.ts
import type { Place } from '@/lib/types'
import type { CrowdForecast } from './types'

const ENDPOINT = 'https://besttime.app/api/v1/forecasts'
const TIMEOUT_MS = 5000

interface BestTimeHour { hour: number; intensity_nr: number }
interface BestTimeDay { day_info: { day_int: number }; day_raw: number[]; hour_analysis?: BestTimeHour[] }
interface BestTimeResponse { status: string; venue_info?: { venue_id?: string }; analysis?: BestTimeDay[] }

export async function fetchBestTimeForecast(place: Place): Promise<CrowdForecast | null> {
  const key = process.env.BESTTIME_PRIVATE_KEY
  if (!key) return null

  const url =
    `${ENDPOINT}?api_key_private=${encodeURIComponent(key)}` +
    `&venue_name=${encodeURIComponent(place.name)}` +
    `&venue_address=${encodeURIComponent(place.address)}`

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  let json: BestTimeResponse
  try {
    const res = await fetch(url, { method: 'POST', signal: ctrl.signal })
    json = (await res.json()) as BestTimeResponse
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }

  if (json.status !== 'OK' || !json.analysis) return null

  const weekly: (number | null)[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => null as number | null)
  )
  for (const day of json.analysis) {
    const d = day.day_info?.day_int
    if (d === undefined || d < 0 || d > 6) continue
    for (let h = 0; h < 24; h++) weekly[d][h] = day.day_raw?.[h] ?? null
    for (const ha of day.hour_analysis ?? []) {
      if (ha.intensity_nr === 999 && ha.hour >= 0 && ha.hour < 24) weekly[d][ha.hour] = null
    }
  }

  return {
    source: 'besttime',
    weekly,
    fetchedAt: new Date().toISOString(),
    venueId: json.venue_info?.venue_id,
  }
}
