'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Place, PlaceType, TransportMode } from '@/lib/types'
import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'
import { PlaceList } from '@/components/PlaceList'

export default function InputPage() {
  const router = useRouter()
  const [places, setPlaces] = useState<Place[]>([])
  const [days, setDays] = useState(2)
  const [mode, setMode] = useState<TransportMode>('driving')

  const handlePlacesFound = useCallback((newPlaces: Place[]) => {
    setPlaces((prev) => {
      const combined = [...prev, ...newPlaces]
      return combined.slice(0, 25)
    })
  }, [])

  const handleTypeChange = useCallback((id: string, type: PlaceType) => {
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, type } : p)))
  }, [])

  const handleRemove = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const handleSubmit = () => {
    if (places.length < 2) return
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    router.push(`/itinerary?days=${days}&mode=${mode}`)
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">旅遊行程規劃</h1>
      <p className="text-gray-500 mb-8">貼上旅遊文章或行程筆記，自動分析所有景點與餐廳</p>

      <section className="mb-6">
        <ItineraryPasteInput onPlacesFound={handlePlacesFound} />
        {places.length >= 25 && (
          <p className="text-red-500 text-sm mt-2">已達最多 25 個地點</p>
        )}
      </section>

      <section className="mb-6">
        <PlaceList places={places} onTypeChange={handleTypeChange} onRemove={handleRemove} />
      </section>

      <section className="flex gap-6 mb-8">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">天數</span>
          <input
            type="number"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-center"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">交通方式</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as TransportMode)}
            className="border border-gray-300 rounded-lg px-3 py-2"
          >
            <option value="driving">開車</option>
            <option value="walking">步行</option>
            <option value="transit">大眾運輸</option>
          </select>
        </label>
      </section>

      <button
        onClick={handleSubmit}
        disabled={places.length < 2}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        開始規劃 →
      </button>
    </main>
  )
}
