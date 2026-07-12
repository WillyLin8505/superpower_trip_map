'use client'
import { useState } from 'react'
import type { CategoryBuckets, DayRecommendation, RecommendationCenter, Candidate, Place } from '@/lib/types'
import { DayRecommendations } from './DayRecommendations'
import { CandidatePanel } from './CandidatePanel'

type Tab = 'recommend' | 'candidates' | 'archive'
type Category = 'dessert' | 'attraction' | 'restaurant'

interface Props {
  // 推薦行程 tab
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
  // LINE 討論 tab
  candidates: Candidate[]
  onAddCandidatePlace: (place: Place) => void
  onAddCandidatePlaces: (places: Place[]) => void
  onRemoveCandidate: (candidateId: string) => void
  onAddCandidateToDay?: (candidateId: string, place: Place) => void
  onArchiveCandidate?: (candidateId: string) => void
  // 封存 tab
  archived: Candidate[]
  onAddArchivedToDay: (candidateId: string, place: Place) => void
  onDeleteArchived: (candidateId: string) => void
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'recommend', label: '推薦行程' },
  { key: 'candidates', label: 'LINE 討論' },
  { key: 'archive', label: '封存' },
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
        {tab === 'candidates' && (
          <CandidatePanel
            candidates={props.candidates}
            onAddPlace={props.onAddCandidatePlace}
            onAddPlaces={props.onAddCandidatePlaces}
            onRemove={props.onRemoveCandidate}
            onAddToDay={props.onAddCandidateToDay}
            onArchive={props.onArchiveCandidate}
          />
        )}
        {tab === 'archive' && (
          props.archived.length === 0 ? (
            <p className="text-sm text-muted py-4" data-testid="archive-empty">尚未封存任何地點</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="archive-list">
              {props.archived.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm border border-border rounded px-2 py-1 text-ink">
                  <span className="flex-1">{a.place.name}</span>
                  <button
                    type="button"
                    onClick={() => props.onAddArchivedToDay(a.id, a.place)}
                    className="text-clay-deep hover:underline"
                  >
                    加入行程
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onDeleteArchived(a.id)}
                    className="text-error hover:underline"
                  >
                    永久刪除
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  )
}
