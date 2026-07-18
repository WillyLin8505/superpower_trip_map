import { GET } from '@/app/api/place-photos/route'
import { NextRequest } from 'next/server'

global.fetch = jest.fn()

describe('GET /api/place-photos', () => {
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

    const req = new NextRequest('http://localhost/api/place-photos?placeId=place-1')
    const res = await GET(req)
    const body = await res.json()

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('place_id=place-1'), expect.any(Object))
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

    const req = new NextRequest('http://localhost/api/place-photos?placeId=place-1&limit=1')
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
})
