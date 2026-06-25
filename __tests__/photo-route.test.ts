import { GET } from '@/app/api/photo/route'
import { NextRequest } from 'next/server'

global.fetch = jest.fn()

describe('GET /api/photo', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when ref param is missing', async () => {
    const req = new NextRequest('http://localhost/api/photo')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('fetches from Google with the server API key and returns the image', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    const fakeImage = new ArrayBuffer(4)
    ;(fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => fakeImage,
    })

    const req = new NextRequest('http://localhost/api/photo?ref=ABC123')
    const res = await GET(req)

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('photo_reference=ABC123')
    )
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('key=test-key')
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
  })

  it('returns 502 when Google fetch fails', async () => {
    ;(fetch as jest.Mock).mockResolvedValueOnce({ ok: false })
    const req = new NextRequest('http://localhost/api/photo?ref=BAD')
    const res = await GET(req)
    expect(res.status).toBe(502)
  })
})
