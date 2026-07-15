import { NextRequest } from 'next/server'
import { googleMapsPhotoCacheControl } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { tripIdFromReferer } from '@/lib/apiUsageContext'

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) return new Response('missing ref', { status: 400 })

  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=400&photo_reference=${ref}&key=${process.env.GOOGLE_MAPS_API_KEY}`

  const upstream = await trackedApiFetch(url, undefined, {
    provider: 'google_maps',
    endpoint: 'place_photo_media',
    skuHint: 'place_photo_media',
    tripId: tripIdFromReferer(req.headers.get('referer')),
  })
  if (!upstream.ok) return new Response('failed to fetch photo', { status: 502 })

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const body = await upstream.arrayBuffer()

  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': googleMapsPhotoCacheControl(),
    },
  })
}
