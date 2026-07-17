'use client'
import { useState } from 'react'
import { searchPlace } from '@/app/actions/places'
import type { Place } from '@/lib/types'
import { inferType, TYPE_META } from '@/lib/placeType'
import { resolveLocalizedAddress, resolveLocalizedText } from '@/lib/utils/localizedPlace'

interface Props {
  onAdd: (place: Place) => void
}

export function PlaceSearchBar({ onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Place | null | 'not-found'>(null)
  const resultName = result && result !== 'not-found'
    ? resolveLocalizedText(result.localizedName, result.name)
    : null
  const resultAddress = result && result !== 'not-found'
    ? resolveLocalizedAddress(result.localizedAddress, result.address)
    : null

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
          className="px-4 py-2 bg-clay text-white text-sm rounded-lg hover:bg-clay-deep disabled:opacity-50"
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
            <span className="font-medium text-gray-900 text-sm">{resultName?.primary}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_META[inferType(query)].badge}`}>
              {TYPE_META[inferType(query)].label}
            </span>
          </div>
          {resultName?.secondary && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{resultName.secondary}</p>
          )}
          {resultAddress && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{resultAddress}</p>
          )}
        </button>
      )}
    </div>
  )
}
