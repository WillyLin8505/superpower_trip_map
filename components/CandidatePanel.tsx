'use client'
import type { Candidate, Place } from '@/lib/types'
import { CombinedInput } from '@/components/CombinedInput'

interface CandidatePanelProps {
  candidates: Candidate[]
  onAddPlace: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
  onRemove: (candidateId: string) => void
}

export function CandidatePanel({ candidates, onAddPlace, onAddPlaces, onRemove }: CandidatePanelProps) {
  return (
    <section className="border rounded-md p-4 flex flex-col gap-3">
      <h2 className="font-medium">候選池</h2>
      <CombinedInput onAdd={onAddPlace} onAddPlaces={onAddPlaces} />
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500">還沒有候選，搜尋想去的地方加進來吧</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1">
              <span className="flex-1">{c.place.name}<span className="text-gray-400 ml-2">由 {c.addedByName} 加入</span></span>
              <button onClick={() => onRemove(c.id)} className="text-red-600 hover:underline">移除</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
