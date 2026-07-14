import { NextRequest } from 'next/server'
import { POST } from '@/app/api/place-index/route'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}))

const upsert = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(createClient as jest.Mock).mockReturnValue({
    auth: {
      getUser: jest.fn(async () => ({ data: { user: { id: 'user-1' } } })),
    },
    from: jest.fn(() => ({ upsert })),
  })
})

it('falls back to the legacy user_place_index schema when migration is not applied yet', async () => {
  upsert
    .mockResolvedValueOnce({ error: { code: '42703', message: 'column source does not exist' } })
    .mockResolvedValueOnce({ error: null })

  const req = new NextRequest('http://localhost/api/place-index', {
    method: 'POST',
    body: JSON.stringify({
      placeId: 'google-1',
      name: 'Cafe',
      lat: 25.1,
      lng: 121.1,
      category: 'dessert',
      source: 'google',
    }),
  })
  const res = await POST(req)

  expect(await res.json()).toEqual({ ok: true })
  expect(upsert).toHaveBeenNthCalledWith(
    2,
    {
      owner_id: 'user-1',
      place_id: 'google-1',
      name: 'Cafe',
      lat: 25.1,
      lng: 121.1,
      category: 'dessert',
    },
    { onConflict: 'owner_id,place_id,category' }
  )
})
