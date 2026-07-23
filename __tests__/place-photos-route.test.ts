import { GET } from '@/app/api/place-photos/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/openPoi', () => ({
  resolveFreeImageForPlace: jest.fn(),
}))

import { resolveFreeImageForPlace } from '@/lib/openPoi'

global.fetch = jest.fn()
const resolveFreeImageForPlaceMock = resolveFreeImageForPlace as jest.Mock

describe('GET /api/place-photos', () => {
  const googlePlaceId = 'ChIJplace1234567890'

  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetch as jest.Mock).mockReset()
    resolveFreeImageForPlaceMock.mockReset()
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    delete process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE
  })

  it('returns up to five proxied photo URLs for a place id', async () => {
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          photos: [
            { photo_reference: 'ref1' },
            { photo_reference: 'ref2' },
            { photo_reference: 'ref3' },
            { photo_reference: 'ref4' },
            { photo_reference: 'ref5' },
            { photo_reference: 'ref6' },
          ],
        },
      }),
    })

    const req = new NextRequest(`http://localhost/api/place-photos?placeId=${googlePlaceId}`)
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`place_id=${googlePlaceId}`), expect.any(Object))
    expect(res.headers.get('cache-control')).toContain('s-maxage=')
    expect(body.photoUrls).toEqual([
      '/api/photo?ref=ref1',
      '/api/photo?ref=ref2',
      '/api/photo?ref=ref3',
      '/api/photo?ref=ref4',
      '/api/photo?ref=ref5',
    ])
  })

  it('honors limit=1 for cover-only photo fetches', async () => {
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'OK',
        result: {
          photos: [
            { photo_reference: 'ref1' },
            { photo_reference: 'ref2' },
          ],
        },
      }),
    })

    const req = new NextRequest(`http://localhost/api/place-photos?placeId=${googlePlaceId}&limit=1`)
    const res = await GET(req)
    const body = await res.json()

    expect(body.photoUrls).toEqual(['/api/photo?ref=ref1'])
  })

  it('falls back to a location-biased text lookup when a Google place id has no photos', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce(null)
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: { photos: [] },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          candidates: [{ place_id: 'ChIJtrainStreetText' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: { photos: [{ photo_reference: 'train-text-photo' }] },
        }),
      })

    const req = new NextRequest(`http://localhost/api/place-photos?placeId=${googlePlaceId}&placeName=Train+Street&alias=Hanoi+Train+Street&lat=21.0177&lng=105.8408&limit=1`)
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining(`place_id=${googlePlaceId}`), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('input=Hanoi+Train+Street'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('locationbias=circle%3A5000%4021.0177%2C105.8408'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(3, expect.stringContaining('place_id=ChIJtrainStreetText'), expect.any(Object))
    expect(body.photoUrls).toEqual(['/api/photo?ref=train-text-photo'])
  })

  it('returns no photos without calling Google when the API key is missing', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY

    const req = new NextRequest('http://localhost/api/place-photos?placeId=place-1&limit=1')
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).not.toHaveBeenCalled()
    expect(body.photoUrls).toEqual([])
  })

  it('uses free image lookup by place name before Google photo metadata', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce({
      photoUrls: ['https://images.example/hanoi-train-street.jpg'],
      source: 'wikidata',
    })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=ChIJtrainstreet123456&placeName=%E7%81%AB%E8%BB%8A%E8%A1%97&limit=1')
    const res = await GET(req)
    const body = await res.json()

    expect(resolveFreeImageForPlaceMock).toHaveBeenCalledWith({
      placeId: 'ChIJtrainstreet123456',
      placeName: '火車街',
      aliases: [],
      category: 'attraction',
      allowGeneric: false,
      limit: 1,
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(body.photoUrls).toEqual(['https://images.example/hanoi-train-street.jpg'])
  })

  it('does not top up with generic category images when paid photo fallback is off', async () => {
    process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE = 'off'
    resolveFreeImageForPlaceMock.mockResolvedValueOnce({
      photoUrls: ['https://images.example/train-street-exact.jpg'],
      source: 'wikidata',
    })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=osm%3Away%2Ftrain-street&placeName=Train+Street&placeType=attraction')
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).not.toHaveBeenCalled()
    expect(resolveFreeImageForPlaceMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      allowGeneric: false,
      placeName: 'Train Street',
      limit: 5,
    }))
    expect(resolveFreeImageForPlaceMock).toHaveBeenCalledTimes(1)
    expect(body.photoUrls).toEqual(['https://images.example/train-street-exact.jpg'])
  })

  it('uses Google Maps as the last fallback for non-Google place ids when free lookup misses', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce(null)
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          candidates: [{ place_id: 'ChIJmvtGooglePlace' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: {
            photos: [{ photo_reference: 'mvt-google-photo' }],
          },
        }),
      })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=osm%3Anode%2F1308439468&placeName=MVTTS+%E5%92%96%E5%95%A1&placeType=dessert&alias=C%C3%A0+Ph%C3%AA+MVTTS&limit=1')
    const res = await GET(req)
    const body = await res.json()

    expect(resolveFreeImageForPlaceMock).toHaveBeenCalledWith({
      placeId: 'osm:node/1308439468',
      placeName: 'MVTTS 咖啡',
      aliases: ['Cà Phê MVTTS'],
      category: 'dessert',
      allowGeneric: false,
      limit: 1,
    })
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/findplacefromtext/json?'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('input=C%C3%A0+Ph%C3%AA+MVTTS'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('place_id=ChIJmvtGooglePlace'), expect.any(Object))
    expect(body.photoUrls).toEqual(['/api/photo?ref=mvt-google-photo'])
  })

  it('adds location bias to Google text fallback when coordinates are available', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce(null)
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          candidates: [{ place_id: 'ChIJappleTart' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: { photos: [{ photo_reference: 'apple-photo' }] },
        }),
      })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=osm%3Anode%2F4240313697&placeName=Apple+Tart+%E5%92%96%E5%95%A1&placeType=dessert&alias=C%C3%A0+Ph%C3%AA+Apple+Tart&lat=21.028&lng=105.848&limit=1')
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('input=C%C3%A0+Ph%C3%AA+Apple+Tart'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('locationbias=circle%3A5000%4021.028%2C105.848'), expect.any(Object))
    expect(body.photoUrls).toEqual(['/api/photo?ref=apple-photo'])
  })

  it('tries the next text query when the first alias has no photos', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce(null)
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          candidates: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          candidates: [{ place_id: 'ChIJbonBon' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: { photos: [{ photo_reference: 'bon-bon-photo' }] },
        }),
      })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=osm%3Anode%2F4358175599&placeName=C%E1%BB%ADa+H%C3%A0ng+B%C3%A1nh+M%C3%AC+Bon+Bon&placeType=dessert&alias=Bon+Bon+Bakery&limit=1')
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('input=Bon+Bon+Bakery'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('input=C%E1%BB%ADa+H%C3%A0ng+B%C3%A1nh+M%C3%AC+Bon+Bon'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(3, expect.stringContaining('place_id=ChIJbonBon'), expect.any(Object))
    expect(body.photoUrls).toEqual(['/api/photo?ref=bon-bon-photo'])
  })

  it('tops up a single exact free image with Google photos when the card asks for all five', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce({
      photoUrls: ['https://images.example/hanoi-train-street.jpg'],
      source: 'wikidata',
    })
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          candidates: [{ place_id: 'ChIJtrainStreetGooglePlace' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: {
            photos: [
              { photo_reference: 'train-google-1' },
              { photo_reference: 'train-google-2' },
              { photo_reference: 'train-google-3' },
              { photo_reference: 'train-google-4' },
            ],
          },
        }),
      })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=osm%3Away%2Ftrain-street&placeName=Train+Street&placeType=attraction')
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/findplacefromtext/json?'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('place_id=ChIJtrainStreetGooglePlace'), expect.any(Object))
    expect(body.photoUrls).toEqual([
      'https://images.example/hanoi-train-street.jpg',
      '/api/photo?ref=train-google-1',
      '/api/photo?ref=train-google-2',
      '/api/photo?ref=train-google-3',
      '/api/photo?ref=train-google-4',
    ])
  })

  it('prefers Google photo results over free-image matches for local businesses', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce({
      photoUrls: [
        'https://images.example/free-king-roti-1.jpg',
        'https://images.example/free-king-roti-2.jpg',
        'https://images.example/free-king-roti-3.jpg',
        'https://images.example/free-king-roti-4.jpg',
        'https://images.example/free-king-roti-5.jpg',
      ],
      source: 'openverse',
    })
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          candidates: [{ place_id: 'ChIJkingRotiGoogle' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: {
            photos: [
              { photo_reference: 'king-google-1' },
              { photo_reference: 'king-google-2' },
            ],
          },
        }),
      })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=osm%3Anode%2F4427721996&placeName=King+Roti&placeType=dessert&alias=Cua+Hang+Banh+Mi+King+Roti&lat=21.0324&lng=105.8507')
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('input=Cua+Hang+Banh+Mi+King+Roti'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('place_id=ChIJkingRotiGoogle'), expect.any(Object))
    expect(body.photoUrls).toEqual([
      '/api/photo?ref=king-google-1',
      '/api/photo?ref=king-google-2',
      'https://images.example/free-king-roti-1.jpg',
      'https://images.example/free-king-roti-2.jpg',
      'https://images.example/free-king-roti-3.jpg',
    ])
  })

  it('does not return a generic category image before the Google text fallback', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce({
      photoUrls: ['https://images.example/generic-cafe-dessert.jpg'],
      source: 'openverse',
      generic: true,
    })
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          candidates: [{ place_id: 'ChIJorickCoffee' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: {
            photos: [{ photo_reference: 'orick-google-photo' }],
          },
        }),
      })

    const req = new NextRequest('http://localhost/api/place-photos?placeId=osm%3Anode%2Forick&placeName=Orick+Coffee&placeType=dessert&limit=1')
    const res = await GET(req)
    const body = await res.json()

    expect(resolveFreeImageForPlaceMock).toHaveBeenCalledWith({
      placeId: 'osm:node/orick',
      placeName: 'Orick Coffee',
      aliases: [],
      category: 'dessert',
      allowGeneric: false,
      limit: 1,
    })
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/findplacefromtext/json?'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('place_id=ChIJorickCoffee'), expect.any(Object))
    expect(body.photoUrls).toEqual(['/api/photo?ref=orick-google-photo'])
  })

  it('does not top up attraction cards with generic free images after Google has fewer than five photos', async () => {
    resolveFreeImageForPlaceMock.mockResolvedValueOnce(null)
    ;(fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          result: {
            photos: [
              { photo_reference: 'shrine-google-1' },
              { photo_reference: 'shrine-google-2' },
              { photo_reference: 'shrine-google-3' },
              { photo_reference: 'shrine-google-4' },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'ZERO_RESULTS',
          candidates: [],
        }),
      })

    const req = new NextRequest(`http://localhost/api/place-photos?placeId=${googlePlaceId}&placeName=Shinmeigu&placeType=attraction`)
    const res = await GET(req)
    const body = await res.json()

    expect(resolveFreeImageForPlaceMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      allowGeneric: false,
      placeName: 'Shinmeigu',
    }))
    expect(resolveFreeImageForPlaceMock).toHaveBeenCalledTimes(1)
    expect(body.photoUrls).toEqual([
      '/api/photo?ref=shrine-google-1',
      '/api/photo?ref=shrine-google-2',
      '/api/photo?ref=shrine-google-3',
      '/api/photo?ref=shrine-google-4',
    ])
  })
})
