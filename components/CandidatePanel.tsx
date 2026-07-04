'use client'
import { useState } from 'react'
import type { Candidate, Place } from '@/lib/types'
import { CombinedInput } from '@/components/CombinedInput'

interface CandidatePanelProps {
  candidates: Candidate[]
  dayCount: number
  onAddPlace: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
  onRemove: (candidateId: string) => void
  onPromote: (place: Place, dayIndex: number, candidateId: string) => void
}

export function CandidatePanel({ candidates, dayCount, onAddPlace, onAddPlaces, onRemove, onPromote }: CandidatePanelProps) {
  const [dayByCand, setDayByCand] = useState<Record<string, number>>({})

  return (
    <section className="border rounded-md p-4 flex flex-col gap-3">
      <h2 className="font-medium">候選池</h2>
      <CombinedInput onAdd={onAddPlace} onAddPlaces={onAddPlaces} />
      {candidates.length === 0 ? (
        <p className="text-sm text-gray-500">還沒有候選，搜尋想去的地方加進來吧</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => {
            const sel = dayByCand[c.id] ?? 0
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 text-sm border rounded px-2 py-1">
                <span className="flex-1">{c.place.name}<span className="text-gray-400 ml-2">由 {c.addedByName} 加入</span></span>
                <select
                  aria-label={`放進第幾天 ${c.place.name}`}
                  value={sel}
                  onChange={(e) => setDayByCand((m) => ({ ...m, [c.id]: Number(e.target.value) }))}
                  className="border rounded px-1 py-0.5"
                >
                  {Array.from({ length: dayCount }, (_, i) => (
                    <option key={i} value={i}>第 {i + 1} 天</option>
                  ))}
                </select>
                <button onClick={() => onPromote(c.place, sel, c.id)} className="border rounded px-2 py-0.5 hover:bg-gray-50">放進</button>
                <button onClick={() => onRemove(c.id)} className="text-red-600 hover:underline">移除</button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
