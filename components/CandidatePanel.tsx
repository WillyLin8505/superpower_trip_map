'use client'
import type { Candidate, DayRecommendation, Place } from '@/lib/types'
import { RecommendationCard } from './RecommendationCard'

interface CandidatePanelProps {
  candidates: Candidate[]
  dateIso: string
  onAdd: (candidateId: string, place: Place) => void
  onArchive: (candidate: Candidate) => void
  onDelete: (candidateId: string) => void
}

function candidateToRecommendation(candidate: Candidate): DayRecommendation {
  const lineName = candidate.source?.kind === 'line_group' ? candidate.source.lineDisplayName : null
  return {
    ...candidate.place,
    reason: candidate.source?.kind === 'line_group' && candidate.source.messageText
      ? `LINE 討論：${candidate.source.messageText}`
      : 'LINE Bot 討論中的地點',
    sourceLabel: `LINE / ${lineName ?? candidate.addedByName}`,
  }
}

export function CandidatePanel({ candidates, dateIso, onAdd, onArchive, onDelete }: CandidatePanelProps) {
  return (
    <section className="border border-border rounded-lg p-4 bg-surface flex flex-col gap-3" data-testid="line-candidate-panel">
      <h2 className="font-medium text-ink">LINE 討論的行程</h2>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">尚無 LINE Bot 討論中的地點</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="space-y-2" data-testid={`line-candidate-card-${candidate.id}`}>
              <RecommendationCard
                rec={candidateToRecommendation(candidate)}
                dateIso={dateIso}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => onAdd(candidate.id, candidate.place)}
                  data-testid={`line-candidate-add-${candidate.id}`}
                  className="rounded-full bg-clay px-3 py-1 text-sm text-white hover:bg-clay-deep"
                >
                  加入行程
                </button>
                <button
                  type="button"
                  onClick={() => onArchive(candidate)}
                  data-testid={`line-candidate-archive-${candidate.id}`}
                  className="rounded-full border border-clay px-3 py-1 text-sm text-clay-deep hover:bg-clay-tint"
                >
                  加入備用
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(candidate.id)}
                  data-testid={`line-candidate-delete-${candidate.id}`}
                  className="rounded-full border border-error/30 px-3 py-1 text-sm text-error hover:bg-red-50"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
