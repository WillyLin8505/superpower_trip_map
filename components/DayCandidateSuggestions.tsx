'use client'
import type { Candidate, Place } from '@/lib/types'

interface Props {
  candidates: Candidate[]
  onAdd: (candidateId: string, place: Place) => void
}

export function DayCandidateSuggestions({ candidates, onAdd }: Props) {
  if (candidates.length === 0) return null
  return (
    <div className="mt-3 border-t border-gray-200 pt-3" data-testid="day-candidate-suggestions">
      <p className="text-xs font-semibold text-gray-600 mb-2">候選池建議這一天</p>
      <div className="space-y-2">
        {candidates.map((c) => (
          <div key={c.id} className="border border-gray-200 rounded-xl p-3" data-testid={`cand-sugg-${c.id}`}>
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onAdd(c.id, c.place)}
                aria-label={`加入 ${c.place.name}`}
                data-testid={`cand-add-${c.id}`}
                className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-blue-600 text-white text-sm flex items-center justify-center hover:bg-blue-700"
              >
                &#x2190;
              </button>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 text-sm">{c.place.name}</h4>
                <p className="text-[11px] text-gray-400 mt-0.5">由 {c.addedByName} 加入</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
