import { stripRepeatedPhotoSets } from '@/lib/utils/photoSanitizer'
import type { ScheduledPlace } from '@/lib/types'

function place(id: string, name: string, photoUrls: string[]): ScheduledPlace {
  return {
    id,
    placeId: id,
    name,
    localizedName: null,
    type: 'attraction',
    lat: 0,
    lng: 0,
    address: '',
    localizedAddress: null,
    openingHours: null,
    rating: null,
    photoUrl: photoUrls[0] ?? null,
    photoUrls,
    description: null,
    aiDescription: null,
    startTime: '09:00',
    durationMin: 90,
    travelMinToNext: null,
    travelDistanceToNext: null,
    legMode: 'driving',
    outsideHours: false,
    lateExit: false,
    startLocked: false,
    durationLocked: false,
    endLocked: false,
  }
}

it('strips repeated multi-photo sets from different itinerary places', () => {
  const stalePhotos = [
    'https://images.example/generic-1.jpg',
    'https://images.example/generic-2.jpg',
    'https://images.example/generic-3.jpg',
    'https://images.example/generic-4.jpg',
    'https://images.example/generic-5.jpg',
  ]

  const result = stripRepeatedPhotoSets([
    place('asakusa-shrine', '浅草神社', stalePhotos),
    place('tokyo-skytree', '東京晴空塔', [...stalePhotos].reverse()),
    place('ueno-park', '上野公園', ['https://images.example/ueno.jpg']),
  ])

  expect(result[0]).toMatchObject({ photoUrl: null, photoUrls: [] })
  expect(result[1]).toMatchObject({ photoUrl: null, photoUrls: [] })
  expect(result[2]).toMatchObject({ photoUrl: 'https://images.example/ueno.jpg' })
})

it('keeps repeated photos for the same place identity', () => {
  const photos = [
    'https://images.example/skytree-1.jpg',
    'https://images.example/skytree-2.jpg',
    'https://images.example/skytree-3.jpg',
  ]
  const first = place('tokyo-skytree', '東京晴空塔', photos)
  const second = { ...place('tokyo-skytree-copy', '東京晴空塔', photos), placeId: first.placeId }

  expect(stripRepeatedPhotoSets([first, second])).toEqual([first, second])
})
