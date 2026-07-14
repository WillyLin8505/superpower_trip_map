import { googleMapsSearchUrl } from '@/lib/utils/googleMapsUrl'

it('builds a Google Maps search URL with a Google place id', () => {
  const url = googleMapsSearchUrl(
    { placeId: 'ChIJ_yushan_shrine', address: 'Hanoi, Vietnam', lat: 21.0287, lng: 105.852 },
    '玉山祠'
  )

  expect(url).toContain('https://www.google.com/maps/search/')
  expect(new URL(url).searchParams.get('query')).toBe('玉山祠 Hanoi, Vietnam')
  expect(new URL(url).searchParams.get('query_place_id')).toBe('ChIJ_yushan_shrine')
})

it('omits query_place_id for non-Google place ids', () => {
  const url = googleMapsSearchUrl(
    { placeId: 'overture:123', address: '', lat: 21.0287, lng: 105.852 },
    'Open POI'
  )

  expect(new URL(url).searchParams.get('query')).toBe('Open POI')
  expect(new URL(url).searchParams.get('query_place_id')).toBeNull()
})
