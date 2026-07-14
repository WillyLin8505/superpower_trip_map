import { buildUserPlaceIndexRow } from '@/lib/userPlaceIndex'
import type { Place } from '@/lib/types'

it('builds a minimal user place index row from a place', () => {
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

  expect(buildUserPlaceIndexRow('user-1', place)).toEqual({
    owner_id: 'user-1',
    place_id: 'google-1',
    name: 'Cafe',
    lat: 25.1,
    lng: 121.1,
    category: 'dessert',
  })
})
