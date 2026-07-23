import type { ScheduledPlace } from '@/lib/types'

const MIN_REPEATED_PHOTO_SET_SIZE = 3

function photoSetKey(place: Pick<ScheduledPlace, 'photoUrl' | 'photoUrls'>): string | null {
  const photos = place.photoUrls?.length ? place.photoUrls : place.photoUrl ? [place.photoUrl] : []
  const uniquePhotos = Array.from(new Set(photos.filter(Boolean))).sort()
  if (uniquePhotos.length < MIN_REPEATED_PHOTO_SET_SIZE) return null
  return uniquePhotos.join('\u0000')
}

export function stripRepeatedPhotoSets<T extends Pick<ScheduledPlace, 'id' | 'placeId' | 'name' | 'photoUrl' | 'photoUrls'>>(places: T[]): T[] {
  const keysByPlace = new Map<string, string>()
  const identitiesByKey = new Map<string, Set<string>>()

  places.forEach((place) => {
    const key = photoSetKey(place)
    if (!key) return
    keysByPlace.set(place.id, key)
    const identities = identitiesByKey.get(key) ?? new Set<string>()
    identities.add(place.placeId || place.name)
    identitiesByKey.set(key, identities)
  })

  const repeatedKeys = new Set(
    Array.from(identitiesByKey.entries())
      .filter(([, identities]) => identities.size > 1)
      .map(([key]) => key)
  )

  if (repeatedKeys.size === 0) return places

  return places.map((place) => {
    const key = keysByPlace.get(place.id)
    if (!key || !repeatedKeys.has(key)) return place
    return {
      ...place,
      photoUrl: null,
      photoUrls: [],
    }
  })
}
