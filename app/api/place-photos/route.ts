import { NextRequest, NextResponse } from 'next/server'
import { googleMapsFetchOptions, googleMapsPhotoCacheControl } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'

const BASE = 'https://maps.googleapis.com/maps/api/place'

function mapPhotoUrls(photos: Array<{ photo_reference: string }> | undefined, limit: number): string[] {
  return (photos ?? [])
    .slice(0, limit)
    .map((photo) => `/api/photo?ref=${encodeURIComponent(photo.photo_reference)}`)
}

function parseLimit(value: string | null): number {
  if (value === null) return 5
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 5
  return Math.min(5, Math.max(1, Math.trunc(parsed)))
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId')
  if (!placeId) return NextResponse.json({ error: 'missing placeId' }, { status: 400 })
  const limit = parseLimit(req.nextUrl.searchParams.get('limit'))

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'photos',
    key: process.env.GOOGLE_MAPS_API_KEY ?? '',
    language: 'zh-TW',
  })

  const upstream = await trackedApiFetch(`${BASE}/details/json?${params.toString()}`, googleMapsFetchOptions(), {
    provider: 'google_maps',
    endpoint: 'place_photos_metadata',
    skuHint: 'place_details_photos',
    metadata: { limit },
  })
  if (!upstream.ok) return NextResponse.json({ error: 'failed to fetch place photos' }, { status: 502 })

  const data = await upstream.json()
  if (data.status !== 'OK') return NextResponse.json({ photoUrls: [] }, { headers: { 'cache-control': googleMapsPhotoCacheControl() } })

  return NextResponse.json(
    { photoUrls: mapPhotoUrls(data.result?.photos, limit) },
    { headers: { 'cache-control': googleMapsPhotoCacheControl() } }
  )
}
