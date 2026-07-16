import { NextRequest, NextResponse } from 'next/server'
import { googleMapsFetchOptions, googleMapsPhotoCacheControl } from '@/lib/googleMapsCost'
import { trackedApiFetch } from '@/lib/apiUsageEvents'
import { tripIdFromReferer } from '@/lib/apiUsageContext'
import { cachedGoogle, RETRYABLE_GOOGLE_STATUSES } from '@/lib/googleCache'

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

  const tripId = tripIdFromReferer(req.headers.get('referer'), req.nextUrl.origin)

  try {
    // Cache the resolved photo list per (placeId, limit). This endpoint had a
    // 91% exact-repeat rate — the same place's photo metadata was re-fetched on
    // every card render because force-cache is ignored in Route Handlers.
    const photoUrls = await cachedGoogle(['photos', placeId, String(limit)], async () => {
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
        tripId,
      })
      // Throw (don't cache) on transient failures — HTTP error or a Google
      // quota/auth status — so the next call retries. A deterministic non-OK
      // status (e.g. NOT_FOUND / ZERO_RESULTS) is a real "no photos" answer
      // worth caching as [].
      if (!upstream.ok) throw new Error('place_photos_upstream_failed')
      const data = await upstream.json()
      if (data.status && RETRYABLE_GOOGLE_STATUSES.has(data.status)) {
        throw new Error(`place_photos_${data.status}`)
      }
      if (data.status !== 'OK') return []
      return mapPhotoUrls(data.result?.photos, limit)
    })

    return NextResponse.json(
      { photoUrls },
      { headers: { 'cache-control': googleMapsPhotoCacheControl() } }
    )
  } catch {
    return NextResponse.json({ error: 'failed to fetch place photos' }, { status: 502 })
  }
}
