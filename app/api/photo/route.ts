import { NextRequest } from 'next/server'
import { googleMapsPhotoCacheControl, shouldServeGooglePhotoMedia } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { tripIdFromReferer } from '@/lib/apiUsageContext'

const DISABLED_PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <rect width="400" height="260" rx="20" fill="#f4e2da"/>
  <text x="200" y="120" text-anchor="middle" font-family="Arial, sans-serif" font-size="44">📷</text>
  <text x="200" y="158" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#9a4f35">Google 圖片已關閉</text>
</svg>`

function disabledPhotoResponse(): Response {
  return new Response(DISABLED_PHOTO_SVG, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': googleMapsPhotoCacheControl(),
    },
  })
}

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) return new Response('missing ref', { status: 400 })
  if (!shouldServeGooglePhotoMedia()) return disabledPhotoResponse()

  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=400&photo_reference=${ref}&key=${process.env.GOOGLE_MAPS_API_KEY}`

  const upstream = await trackedApiFetch(url, undefined, {
    provider: 'google_maps',
    endpoint: 'place_photo_media',
    skuHint: 'place_photo_media',
    tripId: tripIdFromReferer(req.headers.get('referer'), req.nextUrl.origin),
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
