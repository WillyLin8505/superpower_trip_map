import { NextRequest, NextResponse } from 'next/server'
import { getPlaceDetails } from '@/app/actions/places'

export async function GET(request: NextRequest) {
  const placeId = request.nextUrl.searchParams.get('placeId')?.trim()
  const originalName = request.nextUrl.searchParams.get('originalName')?.trim() || null
  if (!placeId) {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 })
  }

  const place = await getPlaceDetails(placeId, originalName)
  return NextResponse.json({ place })
}
