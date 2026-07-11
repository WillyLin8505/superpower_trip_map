'use client'
import { useEffect, useRef } from 'react'
import type { RecommendationCenter } from '@/lib/types'

interface Props {
  onSelect: (center: RecommendationCenter) => void
}

export function RecommendationCenterPicker({ onSelect }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!inputRef.current || !window.google) return
    const ac = new window.google.maps.places.Autocomplete(inputRef.current)
    ac.addListener('place_changed', () => {
      const p = ac.getPlace()
      if (!p.place_id || !p.geometry?.location) return
      onSelect({
        placeId: p.place_id,
        name: p.name ?? '',
        lat: p.geometry.location.lat(),
        lng: p.geometry.location.lng(),
        address: p.formatted_address ?? null,
        source: 'manual',
      })
      if (inputRef.current) inputRef.current.value = ''
    })
  }, [onSelect])

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
