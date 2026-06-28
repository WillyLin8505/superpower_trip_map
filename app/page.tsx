'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { Place, PlaceType, TransportMode } from '@/lib/types'
import { daysBetween } from '@/lib/utils/date'
import { ItineraryPasteInput } from '@/components/ItineraryPasteInput'
import { PlaceList } from '@/components/PlaceList'

export default function InputPage() {
  const router = useRouter()
  const [places, setPlaces] = useState<Place[]>([])
  const today = new Date()
  const isoToday = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const [startDate, setStartDate] = useState(isoToday)
  const [endDate, setEndDate] = useState(() => {
    const t = new Date(); t.setDate(t.getDate()+1)
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`
  })
  const [mode, setMode] = useState<TransportMode>('driving')

  const handlePlacesFound = useCallback((newPlaces: Place[]) => {
    setPlaces((prev) => {
      const existingIds = new Set(prev.map((p) => p.placeId))
      const deduped = newPlaces.filter((p) => !existingIds.has(p.placeId))
      return [...prev, ...deduped].slice(0, 25)
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
    const days = Math.max(1, daysBetween(startDate, endDate))
    sessionStorage.setItem('pendingPlaces', JSON.stringify(places))
    router.push(`/itinerary?start=${startDate}&days=${days}&mode=${mode}`)
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
          <span className="text-sm font-medium text-gray-700">開始日期</span>
          <input type="date" value={startDate}
            onChange={(e) => {
              const v = e.target.value
              setStartDate(v)
              if (endDate < v) setEndDate(v)
            }}
            className="border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">結束日期</span>
          <input type="date" value={endDate} min={startDate}
            onChange={(e) => setEndDate(e.target.value < startDate ? startDate : e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2" />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">天數</span>
          <span className="px-3 py-2">{Math.max(1, daysBetween(startDate, endDate))} 天</span>
        </div>
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
