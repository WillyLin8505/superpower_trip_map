'use server'

import { getTripEstimatedCostUsd } from '@/lib/apiUsageEvents'

// Client-callable wrapper so the itinerary page can refresh the per-trip
// estimated Google API spend after cost-incurring actions.
export async function getTripCostUsd(tripId: string): Promise<number> {
  if (!tripId) return 0
  return getTripEstimatedCostUsd(tripId)
}
