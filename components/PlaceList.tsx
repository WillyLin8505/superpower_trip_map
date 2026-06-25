'use client'
import type { Place, PlaceType } from '@/lib/types'

interface Props {
  places: Place[]
  onTypeChange: (id: string, type: PlaceType) => void
  onRemove: (id: string) => void
}

export function PlaceList({ places, onTypeChange, onRemove }: Props) {
  if (places.length === 0) {
    return <p className="text-gray-400 text-sm py-4 text-center">尚未加入任何地點</p>
  }
  return (
    <ul className="space-y-2">
      {places.map((p) => (
        <li key={p.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
          <span className="flex-1 font-medium text-gray-800">{p.name}</span>
          <button
            onClick={() => onTypeChange(p.id, p.type === 'attraction' ? 'restaurant' : 'attraction')}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              p.type === 'attraction'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-orange-100 text-orange-700'
            }`}
          >
            {p.type === 'attraction' ? '景點' : '餐廳'}
          </button>
          <button
            onClick={() => onRemove(p.id)}
            className="text-gray-400 hover:text-red-500 text-lg leading-none"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
