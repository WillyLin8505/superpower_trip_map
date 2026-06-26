'use client'
import { useState } from 'react'
import { searchPlace } from '@/app/actions/places'
import type { Place, PlaceType } from '@/lib/types'

const TYPE_LABEL: Record<PlaceType, string> = {
  attraction: '景點',
  restaurant: '餐廳',
  dessert: '甜點',
}

function inferType(query: string): PlaceType {
  const q = query.toLowerCase()
  if (q.includes('甜點') || q.includes('dessert') || q.includes('咖啡') || q.includes('cafe') || q.includes('ice cream') || q.includes('蛋糕')) return 'dessert'
  if (q.includes('餐') || q.includes('restaurant') || q.includes('食堂') || q.includes('bistro')) return 'restaurant'
  return 'attraction'
}

interface Props {
  onAdd: (place: Place) => void
}

export function PlaceSearchBar({ onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Place | null | 'not-found'>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setResult(null)
    const place = await searchPlace(query.trim())
    setLoading(false)
    setResult(place ?? 'not-found')
  }

  const handleAdd = (place: Place) => {
    onAdd({ ...place, type: inferType(query) })
    setQuery('')
    setResult(null)
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
          placeholder="搜尋景點、餐廳或甜點…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '搜尋中…' : '🔍 搜尋'}
        </button>
      </div>
      {result === 'not-found' && (
        <p className="text-sm text-red-500 mt-2">找不到此地點</p>
      )}
      {result && result !== 'not-found' && (
        <button
          type="button"
          onClick={() => handleAdd(result)}
          className="mt-2 w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 text-sm">{result.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
              {TYPE_LABEL[inferType(query)]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{result.address}</p>
        </button>
      )}
    </div>
  )
}
