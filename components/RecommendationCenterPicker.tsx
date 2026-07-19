'use client'
import { useEffect, useRef } from 'react'
import type { RecommendationCenter } from '@/lib/types'

interface Props {
  onSelect: (center: RecommendationCenter) => void
}

export function RecommendationCenterPicker({ onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Latest callback via ref so the Autocomplete is created ONCE (empty deps) without
  // going stale — avoids re-attaching a new Autocomplete/listener on every parent render.
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    if (!inputRef.current) return
    // With loading=async the Maps API may not be ready at mount; poll until it is (the
    // first attempt is synchronous, so an already-loaded API — incl. tests — wires up
    // immediately with no behavior change).
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const setup = () => {
      if (cancelled || !inputRef.current) return
      if (!window.google?.maps?.places) { timer = setTimeout(setup, 200); return }
      const ac = new window.google.maps.places.Autocomplete(inputRef.current)
      ac.addListener('place_changed', () => {
        const p = ac.getPlace()
        if (!p.place_id || !p.geometry?.location) return
        onSelectRef.current({
          placeId: p.place_id,
          name: p.name ?? '',
          lat: p.geometry.location.lat(),
          lng: p.geometry.location.lng(),
          address: p.formatted_address ?? null,
          source: 'manual',
        })
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
      data-testid="rec-center-input"
      placeholder="選擇這一天的推薦中心"
      className="w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}
