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

it('searches by the original name (not the machine-translated zh-TW name) for non-Google pins', () => {
  // Regression: an OSM/Overture pin whose zh-TW name is a bad machine translation
  // ("樂痛日麵包" for "Le Pain Quotidien") produced a Maps link that searched the
  // untranslatable Chinese string and found nothing — the user had to retype the
  // original name. Non-Google pins must search the original/native name instead.
  const url = googleMapsSearchUrl(
    {
      placeId: 'osm:123',
      address: '',
      lat: 35.6812,
      lng: 139.7671,
      localizedName: { zhTw: '樂痛日麵包', original: 'Le Pain Quotidien' },
    },
    '樂痛日麵包'
  )

  const query = new URL(url).searchParams.get('query')
  expect(query).toBe('Le Pain Quotidien')
  expect(query).not.toContain('樂痛日麵包')
  expect(new URL(url).searchParams.get('query_place_id')).toBeNull()
})

it('falls back to the English name when a non-Google pin has no original name', () => {
  const url = googleMapsSearchUrl(
    {
      placeId: 'overture:abc',
      address: '',
      lat: 35.68,
      lng: 139.76,
      localizedName: { zhTw: '樂痛日麵包', en: 'Le Pain Quotidien' },
    },
    '樂痛日麵包'
  )

  expect(new URL(url).searchParams.get('query')).toBe('Le Pain Quotidien')
})

it('keeps the zh-TW display name and place id for Google pins even when an original name exists', () => {
  const url = googleMapsSearchUrl(
    {
      placeId: 'ChIJ_le_pain_tokyo',
      address: 'Tokyo, Japan',
      lat: 35.6812,
      lng: 139.7671,
      localizedName: { zhTw: '每日麵包', original: 'Le Pain Quotidien' },
    },
    '每日麵包'
  )

  expect(new URL(url).searchParams.get('query')).toBe('每日麵包 Tokyo, Japan')
  expect(new URL(url).searchParams.get('query_place_id')).toBe('ChIJ_le_pain_tokyo')
})
