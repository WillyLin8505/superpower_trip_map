import type { ScheduledPlace } from '@/lib/types'

export type LockFacet = 'start' | 'duration' | 'end'

export type EffectivePinned = {
  start: boolean
  duration: boolean
  end: boolean
}

export function effectivePinned(
  place: Pick<ScheduledPlace, 'startLocked' | 'durationLocked' | 'endLocked'>,
): EffectivePinned {
  const explicit = {
    start: place.startLocked,
    duration: place.durationLocked,
    end: place.endLocked ?? false,
  }
  const lockedCount = Number(explicit.start) + Number(explicit.duration) + Number(explicit.end)

  if (lockedCount >= 2) {
    return { start: true, duration: true, end: true }
  }

  return explicit
}

export function isDerived(
  place: Pick<ScheduledPlace, 'startLocked' | 'durationLocked' | 'endLocked'>,
  facet: LockFacet,
): boolean {
  const explicit =
    facet === 'start'
      ? place.startLocked
      : facet === 'duration'
        ? place.durationLocked
        : place.endLocked ?? false

  return effectivePinned(place)[facet] && !explicit
}
