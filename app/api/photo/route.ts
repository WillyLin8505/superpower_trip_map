import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  if (!ref) return new Response('missing ref', { status: 400 })

  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=400&photo_reference=${ref}&key=${process.env.GOOGLE_MAPS_API_KEY}`

  const upstream = await fetch(url)
  if (!upstream.ok) return new Response('failed to fetch photo', { status: 502 })

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  const body = await upstream.arrayBuffer()

  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=86400',
    },
  })
}
