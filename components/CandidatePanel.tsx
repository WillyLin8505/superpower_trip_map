'use client'
import type { Candidate, DayRecommendation, Place } from '@/lib/types'
import { RecommendationCard } from './RecommendationCard'

interface CandidatePanelProps {
  candidates: Candidate[]
  dateIso: string
  onAdd?: (candidateId: string, place: Place) => void
  onArchive?: (candidate: Candidate) => void
  onDelete?: (candidateId: string) => void
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

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function firstHttpUrl(value: string | null | undefined): string | null {
  const match = value?.match(/https?:\/\/\S+/)
  return safeHttpUrl(match?.[0])
}

function lineActionLinks(candidate: Candidate) {
  if (candidate.source?.kind !== 'line_group') return []
  const itineraryUrl = safeHttpUrl(candidate.source.sourceUrl) ?? firstHttpUrl(candidate.source.messageText)
  const discussionUrl = firstHttpUrl(candidate.source.messageText) ?? safeHttpUrl(candidate.source.sourceUrl)
  return [
    itineraryUrl ? { label: '行程', href: itineraryUrl, testId: `line-candidate-itinerary-link-${candidate.id}` } : null,
    discussionUrl ? { label: '討論', href: discussionUrl, testId: `line-candidate-discussion-link-${candidate.id}` } : null,
  ].filter((link): link is { label: string; href: string; testId: string } => link !== null)
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
                onAdd={onAdd ? () => onAdd(candidate.id, candidate.place) : undefined}
                onArchive={onArchive ? () => onArchive(candidate) : undefined}
                onDelete={onDelete ? () => onDelete(candidate.id) : undefined}
                actionLinks={lineActionLinks(candidate)}
                actionTestIds={{
                  add: `line-candidate-add-${candidate.id}`,
                  archive: `line-candidate-archive-${candidate.id}`,
                  delete: `line-candidate-delete-${candidate.id}`,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
