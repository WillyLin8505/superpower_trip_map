'use client'
import { useState } from 'react'
import type { CategoryBuckets, DayRecommendation, RecommendationCenter, Candidate, Place } from '@/lib/types'
import { DayRecommendations } from './DayRecommendations'
import { CandidatePanel } from './CandidatePanel'

type Tab = 'recommend' | 'reserve'
type Category = 'dessert' | 'attraction' | 'restaurant'

interface Props {
  dateIso: string
  recommendations?: CategoryBuckets
  onAddRecommendation: (rec: DayRecommendation) => void
  backfilling?: Partial<Record<Category, boolean>>
  recsHasCenter?: boolean
  recsCenter?: RecommendationCenter | null
  onSetRecommendationCenter?: (center: RecommendationCenter) => void
  onClearRecommendationCenter?: () => void
  onRefreshRecommendationCategory?: (category: Category) => void
  recsRefreshing?: Partial<Record<Category, boolean>>
  recsError?: string | null
  onArchiveRecommendation?: (rec: DayRecommendation) => void
  candidates: Candidate[]
  onAddCandidatePlace: (place: Place) => void
  onAddCandidatePlaces: (places: Place[]) => void
  onRemoveCandidate: (candidateId: string) => void
  onAddCandidateToDay?: (candidateId: string, place: Place) => void
  onArchiveCandidate?: (candidateId: string) => void
  archived: Candidate[]
  onAddArchivedToDay: (candidateId: string, place: Place) => void
  onDeleteArchived: (candidateId: string) => void
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'recommend', label: '推薦行程' },
  { key: 'reserve', label: '備用行程' },
]

export function SidePanel(props: Props) {
  const [tab, setTab] = useState<Tab>('recommend')

  return (
    <div className="flex flex-col h-full" data-testid="side-panel">
      <div className="flex gap-1 mb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            data-testid={`side-panel-tab-${t.key}`}
            className={`text-xs px-2 py-1 rounded-full border ${
              tab === t.key ? 'border-clay bg-clay-tint text-clay-deep' : 'border-gray-200 text-gray-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'recommend' && (
          <DayRecommendations
            recommendations={props.recommendations}
            dateIso={props.dateIso}
            onAdd={props.onAddRecommendation}
            backfilling={props.backfilling}
            hasCenter={props.recsHasCenter}
            center={props.recsCenter}
            onSetCenter={props.onSetRecommendationCenter}
            onClearCenter={props.onClearRecommendationCenter}
            onRefreshCategory={props.onRefreshRecommendationCategory}
            refreshing={props.recsRefreshing}
            error={props.recsError}
            onArchive={props.onArchiveRecommendation}
          />
        )}
        {tab === 'reserve' && (
          <div className="space-y-4" data-testid="reserve-panel">
            <CandidatePanel
              candidates={props.candidates}
              onAddPlace={props.onAddCandidatePlace}
              onAddPlaces={props.onAddCandidatePlaces}
              onRemove={props.onRemoveCandidate}
              onAddToDay={props.onAddCandidateToDay}
              onArchive={props.onArchiveCandidate}
              dateIso={props.dateIso}
            />
            <section className="border border-border rounded-lg p-4 bg-surface">
              <h2 className="font-medium text-ink mb-3">已移入備用</h2>
              {props.archived.length === 0 ? (
                <p className="text-sm text-muted py-2" data-testid="archive-empty">尚未加入任何備用行程</p>
              ) : (
                <ul className="flex flex-col gap-2" data-testid="archive-list">
                  {props.archived.map((archived) => (
                    <li
                      key={archived.id}
                      className="flex items-center justify-between gap-2 text-sm border border-border rounded px-2 py-1 text-ink"
                    >
                      <span className="flex-1">{archived.place.name}</span>
                      <button
                        type="button"
                        onClick={() => props.onAddArchivedToDay(archived.id, archived.place)}
                        data-testid={`archive-add-${archived.id}`}
                        className="text-clay-deep hover:underline"
                      >
                        加入行程
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onDeleteArchived(archived.id)}
                        data-testid={`archive-delete-${archived.id}`}
                        className="text-error hover:underline"
                      >
                        永久刪除
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
