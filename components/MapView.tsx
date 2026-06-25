'use client'
import { useEffect, useRef } from 'react'
import type { ScheduledPlace } from '@/lib/types'

interface Props {
  allPlaces: ScheduledPlace[]   // all places across all days, in visit order
}

export function MapView({ allPlaces }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapRef.current || !window.google || allPlaces.length === 0) return

    const bounds = new window.google.maps.LatLngBounds()
    const map = new window.google.maps.Map(mapRef.current, { zoom: 12 })

    allPlaces.forEach((place, i) => {
      const pos = { lat: place.lat, lng: place.lng }
      bounds.extend(pos)

      new window.google.maps.Marker({
        position: pos,
        map,
        label: { text: String(i + 1), color: 'white', fontWeight: 'bold' },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: place.type === 'attraction' ? '#2563eb' : '#ea580c',
          fillOpacity: 1,
          strokeWeight: 0,
        },
        title: place.name,
      })
    })

    map.fitBounds(bounds)

    // Draw polyline between all places
    if (allPlaces.length > 1) {
      new window.google.maps.Polyline({
        path: allPlaces.map((p) => ({ lat: p.lat, lng: p.lng })),
        geodesic: true,
        strokeColor: '#6366f1',
        strokeOpacity: 0.7,
        strokeWeight: 2,
        map,
      })
    }
  }, [allPlaces])

  return <div ref={mapRef} className="w-full h-full" />
}
