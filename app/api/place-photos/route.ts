import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://maps.googleapis.com/maps/api/place'

function mapPhotoUrls(photos?: Array<{ photo_reference: string }>): string[] {
  return (photos ?? [])
    .slice(0, 5)
    .map((photo) => `/api/photo?ref=${encodeURIComponent(photo.photo_reference)}`)
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId')
  if (!placeId) return NextResponse.json({ error: 'missing placeId' }, { status: 400 })

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'photos',
    key: process.env.GOOGLE_MAPS_API_KEY ?? '',
    language: 'zh-TW',
  })

  const upstream = await fetch(`${BASE}/details/json?${params.toString()}`, {
    next: { revalidate: 3600 },
  })
  if (!upstream.ok) return NextResponse.json({ error: 'failed to fetch place photos' }, { status: 502 })

  const data = await upstream.json()
  if (data.status !== 'OK') return NextResponse.json({ photoUrls: [] })

  return NextResponse.json({ photoUrls: mapPhotoUrls(data.result?.photos) })
}
