import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildUserPlaceIndexRow } from '@/lib/userPlaceIndex'
import type { PlaceType } from '@/lib/types'

const PLACE_TYPES: PlaceType[] = ['attraction', 'restaurant', 'dessert', 'accommodation']

function isPlaceType(value: unknown): value is PlaceType {
  return typeof value === 'string' && PLACE_TYPES.includes(value as PlaceType)
}

function isMissingIndexTable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    placeId?: unknown
    name?: unknown
    lat?: unknown
    lng?: unknown
    category?: unknown
  } | null

  if (
    !body ||
    typeof body.placeId !== 'string' ||
    typeof body.name !== 'string' ||
    typeof body.lat !== 'number' ||
    typeof body.lng !== 'number' ||
    !isPlaceType(body.category)
  ) {
    return NextResponse.json({ error: 'invalid place index payload' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, skipped: 'anonymous' }, { status: 200 })
  }

  const row = buildUserPlaceIndexRow(user.id, {
    placeId: body.placeId,
    name: body.name,
    lat: body.lat,
    lng: body.lng,
    type: body.category,
  })
  const { error } = await supabase
    .from('user_place_index')
    .upsert(row, { onConflict: 'owner_id,place_id,category' })

  if (isMissingIndexTable(error)) {
    return NextResponse.json({ ok: false, skipped: 'missing_table' }, { status: 200 })
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
