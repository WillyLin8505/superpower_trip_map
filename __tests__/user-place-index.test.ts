import { buildUserPlaceIndexRow } from '@/lib/userPlaceIndex'
import type { Place } from '@/lib/types'

it('builds a Google user place index row with a 30-day expiry', () => {
  const place: Place = {
    id: 'local-1',
    placeId: 'google-1',
    name: 'Cafe',
    type: 'dessert',
    lat: 25.1,
    lng: 121.1,
    address: 'Taipei',
    openingHours: ['Monday: 9:00 AM – 6:00 PM'],
    rating: 4.8,
    photoUrl: '/api/photo?ref=one',
    photoUrls: ['/api/photo?ref=one', '/api/photo?ref=two'],
    description: 'Description',
  }

  expect(buildUserPlaceIndexRow('user-1', place, { now: new Date('2026-07-14T00:00:00.000Z') })).toEqual({
    owner_id: 'user-1',
    source: 'google',
    place_id: 'google-1',
    name: 'Cafe',
    lat: 25.1,
    lng: 121.1,
    category: 'dessert',
    expires_at: '2026-08-13T00:00:00.000Z',
  })
})

it('keeps open-data user place index rows without expiry', () => {
  const place: Pick<Place, 'placeId' | 'name' | 'lat' | 'lng' | 'type'> = {
    placeId: 'overture-1',
    name: 'Open Cafe',
    type: 'dessert',
    lat: 25.1,
    lng: 121.1,
  }

  expect(buildUserPlaceIndexRow('user-1', place, { source: 'overture', now: new Date('2026-07-14T00:00:00.000Z') })).toEqual({
    owner_id: 'user-1',
    source: 'overture',
    place_id: 'overture-1',
    name: 'Open Cafe',
    lat: 25.1,
    lng: 121.1,
    category: 'dessert',
    expires_at: null,
  })
})
