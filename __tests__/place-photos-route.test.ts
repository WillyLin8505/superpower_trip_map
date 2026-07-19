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
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
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
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('input=MVTTS+%E5%92%96%E5%95%A1+C%C3%A0+Ph%C3%AA+MVTTS'), expect.any(Object))
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('place_id=ChIJmvtGooglePlace'), expect.any(Object))
    expect(body.photoUrls).toEqual(['/api/photo?ref=mvt-google-photo'])
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
})
