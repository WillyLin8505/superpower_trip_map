'use client'
import { useState } from 'react'
import type { CategoryBuckets, DayRecommendation, RecommendationCenter, Candidate, Place } from '@/lib/types'
import { DayRecommendations } from './DayRecommendations'
import { CandidatePanel } from './CandidatePanel'
import { CombinedInput } from '@/components/CombinedInput'
import { RecommendationCard } from './RecommendationCard'
import { CollectionPanel } from './CollectionPanel'

export type SidePanelTab = 'recommend' | 'line' | 'reserve' | 'collection'
type Tab = SidePanelTab
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
  onDeleteRecommendation?: (rec: DayRecommendation) => void
  candidates: Candidate[]
  archived: Candidate[]
  onAddReservePlace: (place: Place) => void
  onAddReservePlaces: (places: Place[]) => void
  onAddArchivedToDay: (candidateId: string, place: Place) => void
  onDeleteArchived: (candidateId: string) => void
  onAddCandidateToDay: (candidateId: string, place: Place) => void
  onArchiveCandidate: (candidate: Candidate) => void
  onDeleteCandidate: (candidateId: string) => void
  activeTab?: SidePanelTab
  onTabChange?: (tab: SidePanelTab) => void
  collectionBuckets?: CategoryBuckets
  onAddCollectionPlace?: (rec: DayRecommendation) => void
  onArchiveCollection?: (rec: DayRecommendation) => void
  onDismissCollection?: (rec: DayRecommendation) => void
  onCollectionImported?: () => void
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'recommend', label: '推薦行程' },
  { key: 'line', label: 'LINE 討論' },
  { key: 'reserve', label: '備用行程' },
  { key: 'collection', label: '地圖收藏' },
]

function archivedToRecommendation(candidate: Candidate): DayRecommendation {
  return {
    ...candidate.place,
    reason: '備用行程中的地點',
    sourceLabel: `備用行程 / ${candidate.addedByName}`,
  }
}

export function SidePanel(props: Props) {
  const [localTab, setLocalTab] = useState<Tab>('recommend')
  const tab = props.activeTab ?? localTab

  const selectTab = (nextTab: Tab) => {
    if (props.activeTab === undefined) setLocalTab(nextTab)
    props.onTabChange?.(nextTab)
  }

  return (
    <div className="flex flex-col h-full" data-testid="side-panel">
      <div className="flex gap-1 mb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => selectTab(t.key)}
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
            onDelete={props.onDeleteRecommendation}
          />
        )}
        {tab === 'line' && (
          <CandidatePanel
            candidates={props.candidates}
            dateIso={props.dateIso}
            onAdd={props.onAddCandidateToDay}
            onArchive={props.onArchiveCandidate}
            onDelete={props.onDeleteCandidate}
          />
        )}
        {tab === 'reserve' && (
          <section className="border border-border rounded-lg p-4 bg-surface flex flex-col gap-3" data-testid="reserve-panel">
            <h2 className="font-medium text-ink">備用行程</h2>
            <CombinedInput onAdd={props.onAddReservePlace} onAddPlaces={props.onAddReservePlaces} />
            {props.archived.length === 0 ? (
              <p className="text-sm text-muted py-2" data-testid="archive-empty">尚未加入任何備用行程</p>
            ) : (
              <ul className="flex flex-col gap-3" data-testid="archive-list">
                {props.archived.map((archived) => (
                  <li key={archived.id} className="space-y-2" data-testid={`reserve-card-${archived.id}`}>
                    <RecommendationCard
                      rec={archivedToRecommendation(archived)}
                      dateIso={props.dateIso}
                      onAdd={() => props.onAddArchivedToDay(archived.id, archived.place)}
                      onDelete={() => props.onDeleteArchived(archived.id)}
                      actionTestIds={{ delete: `archive-delete-${archived.id}` }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tab === 'collection' && (
          <CollectionPanel
            dateIso={props.dateIso}
            buckets={props.collectionBuckets}
            onAdd={props.onAddCollectionPlace ?? (() => {})}
            onArchive={props.onArchiveCollection ?? (() => {})}
            onDelete={props.onDismissCollection ?? (() => {})}
            onImported={props.onCollectionImported ?? (() => {})}
          />
        )}
      </div>
    </div>
  )
}
