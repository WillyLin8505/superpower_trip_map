'use client'
import type { Candidate, Place } from '@/lib/types'
import { CombinedInput } from '@/components/CombinedInput'

interface CandidatePanelProps {
  candidates: Candidate[]
  onAddPlace: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
  onRemove: (candidateId: string) => void
}

function candidateSourceLabel(candidate: Candidate): string {
  if (candidate.source?.kind === 'line_group') {
    return candidate.source.lineDisplayName
      ? `LINE 群組 / ${candidate.source.lineDisplayName} 加入`
      : 'LINE 群組加入'
  }
  return `${candidate.addedByName} 加入`
}

export function CandidatePanel({ candidates, onAddPlace, onAddPlaces, onRemove }: CandidatePanelProps) {
  return (
    <section className="border border-border rounded-lg p-4 bg-surface flex flex-col gap-3">
      <h2 className="font-medium text-ink">候選池</h2>
      <CombinedInput onAdd={onAddPlace} onAddPlaces={onAddPlaces} />
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">還沒有候選，搜尋想去的地方加進來吧</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded px-2 py-1 text-ink">
              <span className="flex-1">{c.place.name}<span className="text-xs text-gray-500">{candidateSourceLabel(c)}</span></span>
              <button onClick={() => onRemove(c.id)} className="text-error hover:underline">移除</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
