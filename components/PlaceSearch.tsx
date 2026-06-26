'use client'
import { useEffect, useRef } from 'react'
import type { Place } from '@/lib/types'

interface Props {
  onAdd: (place: Place) => void
}

export function PlaceSearch({ onAdd }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!inputRef.current || !window.google) return
    const ac = new window.google.maps.places.Autocomplete(inputRef.current)
    ac.addListener('place_changed', () => {
      const p = ac.getPlace()
      if (!p.place_id || !p.geometry?.location) return
      const place: Place = {
        id: crypto.randomUUID(),
        placeId: p.place_id,
        name: p.name ?? '',
        type: 'attraction',
        lat: p.geometry.location.lat(),
        lng: p.geometry.location.lng(),
        address: p.formatted_address ?? '',
        openingHours: null,
        rating: null,
        photoUrl: null,
        description: null,
      }
      onAdd(place)
      if (inputRef.current) inputRef.current.value = ''
    })
  }, [onAdd])

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder="搜尋景點或餐廳..."
      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}
