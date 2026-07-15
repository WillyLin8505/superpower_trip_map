import { NextRequest, NextResponse } from 'next/server'
import { getPlaceDetails } from '@/app/actions/places'
import { runWithTripId } from '@/lib/apiUsageContext'

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get('placeId')?.trim()
  const originalName = request.nextUrl.searchParams.get('originalName')?.trim() || null
  const tripId = request.nextUrl.searchParams.get('tripId')?.trim() || undefined
  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 })
  }

  const place = await runWithTripId(tripId, () => getPlaceDetails(placeId, originalName))
  return NextResponse.json({ place })
}
