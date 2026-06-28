'use server'
import type { Place } from '@/lib/types'
import type { CrowdForecast } from '@/lib/crowd/types'
import { getCrowdForecast as getForecast } from '@/lib/crowd'

export async function getCrowdForecast(place: Place): Promise<CrowdForecast> {
  return getForecast(place)
}
