'use client'
import type { Candidate, DayRecommendation, Place } from '@/lib/types'
import { CombinedInput } from '@/components/CombinedInput'
import { RecommendationCard } from './RecommendationCard'

interface CandidatePanelProps {
  candidates: Candidate[]
  onAddPlace: (place: Place) => void
  onAddPlaces: (places: Place[]) => void
  onRemove: (candidateId: string) => void
  onArchive?: (candidateId: string) => void
  onAddToDay?: (candidateId: string, place: Place) => void
  dateIso: string
}

function candidateToRecommendation(candidate: Candidate): DayRecommendation {
  return {
    ...candidate.place,
    reason: 'LINE Bot 或成員加入的備用地點',
    sourceLabel: `LINE / ${candidate.addedByName}`,
  }
}

export function CandidatePanel({
  candidates,
  onAddPlace,
  onAddPlaces,
  onRemove,
  onArchive,
  onAddToDay,
  dateIso,
}: CandidatePanelProps) {
  return (
    <section className="border border-border rounded-lg p-4 bg-surface flex flex-col gap-3">
      <h2 className="font-medium text-ink">LINE 討論</h2>
      <CombinedInput onAdd={onAddPlace} onAddPlaces={onAddPlaces} />
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">尚無 LINE 或手動加入的備用地點</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="space-y-2" data-testid={`candidate-card-${candidate.id}`}>
              <RecommendationCard
                rec={candidateToRecommendation(candidate)}
                dateIso={dateIso}
                onAdd={() => onAddToDay?.(candidate.id, candidate.place)}
              />
              <div className="flex justify-end gap-3 text-sm">
                {onArchive && (
                  <button
                    type="button"
                    onClick={() => onArchive(candidate.id)}
                    className="text-muted hover:text-clay-deep"
                  >
                    移到備用
                  </button>
                )}
                <button type="button" onClick={() => onRemove(candidate.id)} className="text-error hover:underline">
                  移除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
