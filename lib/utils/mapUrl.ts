// Requires Maps Embed API enabled in Google Cloud Console (same project as GOOGLE_MAPS_API_KEY)
import type { ScheduledPlace, TransportMode } from '@/lib/types'

const EMBED_MODE: Record<TransportMode, string> = {
  driving: 'driving',
  walking: 'walking',
  transit: 'transit',
}

export function buildDayEmbedUrl(
  places: ScheduledPlace[],
  mode: TransportMode
): string {
  if (places.length < 2) return ''
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!key) return ''
  const origin = encodeURIComponent(`${places[0].lat},${places[0].lng}`)
  const destination = encodeURIComponent(
    `${places[places.length - 1].lat},${places[places.length - 1].lng}`
  )
  const middle = places.slice(1, -1)
  const waypointsParam =
    middle.length > 0
      ? `&waypoints=${encodeURIComponent(middle.map((p) => `${p.lat},${p.lng}`).join('|'))}`
      : ''
  return (
    `https://maps.google.com/maps/embed/v1/directions` +
    `?key=${key}` +
    `&origin=${origin}` +
    `&destination=${destination}` +
    waypointsParam +
    `&mode=${EMBED_MODE[mode]}`
  )
}
