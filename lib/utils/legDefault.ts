import type { LegDefault } from '@/lib/types'

export const WALK_THRESHOLD_M = 500

interface ModeLeg { min: number; distM: number }

export function pickLegDefault(
  distMeters: number,
  driving: ModeLeg,
  transit: ModeLeg,
  walking: ModeLeg
): LegDefault {
  if (distMeters <= WALK_THRESHOLD_M) {
    return { legMode: 'walking', travelMin: walking.min, travelDistanceM: walking.distM }
  }
  // 平手 driving 優先（決定性）
  return driving.min <= transit.min
    ? { legMode: 'driving', travelMin: driving.min, travelDistanceM: driving.distM }
    : { legMode: 'transit', travelMin: transit.min, travelDistanceM: transit.distM }
}
