'use client'
import type { Candidate, DayRecommendation } from '@/lib/types'
import { RecommendationCard } from './RecommendationCard'

interface CandidatePanelProps {
  candidates: Candidate[]
  dateIso: string
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

export function CandidatePanel({ candidates, dateIso }: CandidatePanelProps) {
  return (
    <section className="border border-border rounded-lg p-4 bg-surface flex flex-col gap-3">
      <h2 className="font-medium text-ink">LINE 討論的行程</h2>
      {candidates.length === 0 ? (
        <p className="text-sm text-muted">尚無 LINE Bot 討論中的地點</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {candidates.map((candidate) => (
            <li key={candidate.id} data-testid={`line-candidate-card-${candidate.id}`}>
              <RecommendationCard
                rec={candidateToRecommendation(candidate)}
                dateIso={dateIso}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
