'use client'
import { useEffect, useRef } from 'react'
import type { Place } from '@/lib/types'

interface Props {
  onAdd: (place: Place) => void
}

export function PlaceSearch({ onAdd }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Latest callback via ref so the Autocomplete is created ONCE (empty deps) without
  // going stale — avoids re-attaching a new Autocomplete/listener on every parent render.
  const onAddRef = useRef(onAdd)
  useEffect(() => { onAddRef.current = onAdd }, [onAdd])

  useEffect(() => {
    if (!inputRef.current) return
    // With loading=async the Maps API may not be ready at mount, so poll until it is
    // (the first attempt is synchronous, so an already-loaded API — incl. tests — wires
    // up immediately with no behavior change).
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const setup = () => {
      if (cancelled || !inputRef.current) return
      if (!window.google?.maps?.places) { timer = setTimeout(setup, 200); return }
      const ac = new window.google.maps.places.Autocomplete(inputRef.current)
      ac.addListener('place_changed', () => {
      const p = ac.getPlace()
      if (!p.place_id || !p.geometry?.location) return
      const place: Place = {
        id: crypto.randomUUID(),
        placeId: p.place_id,
        name: p.name ?? '',
        localizedName: {
          zhTw: p.name ?? null,
          original: p.name ?? null,
        },
        type: 'attraction',
        lat: p.geometry.location.lat(),
        lng: p.geometry.location.lng(),
        address: p.formatted_address ?? '',
        localizedAddress: {
          zhTw: p.formatted_address ?? null,
          original: p.formatted_address ?? null,
        },
        openingHours: null,
        rating: null,
        photoUrl: null,
        description: null,
      }
      onAddRef.current(place)
      if (inputRef.current) inputRef.current.value = ''
      })
    }
    setup()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  return (
    <input
      ref={inputRef}
      type="text"
      placeholder="搜尋景點或餐廳..."
      className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}
