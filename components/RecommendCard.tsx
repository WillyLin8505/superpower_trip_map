'use client'
import type { Recommendation } from '@/lib/types'

interface Props {
  rec: Recommendation
  selected: boolean
  onToggle: () => void
}

export function RecommendCard({ rec, selected, onToggle }: Props) {
  return (
    <label className={`flex items-start gap-3 bg-white border rounded-xl p-4 cursor-pointer transition-colors ${
      selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
    } ${!rec.verified ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        disabled={!rec.verified}
        onChange={onToggle}
        className="mt-1 accent-blue-600"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{rec.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            rec.type === 'attraction' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
          }`}>
            {rec.type === 'attraction' ? '景點' : '餐廳'}
          </span>
          {!rec.verified && <span className="text-xs text-gray-400">無法驗證位置</span>}
        </div>
        <p className="text-sm text-gray-600 mt-0.5">{rec.reason}</p>
        <p className="text-xs text-gray-400 mt-0.5">來源：{rec.sourceLabel}</p>
      </div>
    </label>
  )
}
