import type { LegDefault } from '@/lib/types'

const WALK_THRESHOLD_M = 500

export function pickLegDefault(
  distMeters: number,
  drivingMin: number,
  transitMin: number,
  walkingMin: number
): LegDefault {
  if (distMeters <= WALK_THRESHOLD_M) {
    return { legMode: 'walking', travelMin: walkingMin }
  }
  // 平手 driving 優先（決定性）
  return drivingMin <= transitMin
    ? { legMode: 'driving', travelMin: drivingMin }
    : { legMode: 'transit', travelMin: transitMin }
}
