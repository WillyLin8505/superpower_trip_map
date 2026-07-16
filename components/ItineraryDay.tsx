'use client'
import { Fragment } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { ItineraryCard } from './ItineraryCard'
import { buildDayEmbedUrl } from '@/lib/utils/mapUrl'
import { dayDate, formatDateLabel } from '@/lib/utils/date'
import { SidePanel } from './SidePanel'
import type { SidePanelTab } from './SidePanel'
import { freeBlocks, formatGap } from '@/lib/utils/freeTime'
import type { DayItinerary, TransportMode, PlaceType, CategoryBuckets, DayRecommendation, Candidate, Place, RecommendationCenter, ScheduledPlace } from '@/lib/types'

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

interface Props {
  day: DayItinerary
  dayIdx: number
  mode: TransportMode
  startDate: string
  isDragging?: boolean
  draggable?: boolean
  isOverflow?: boolean
  onScatter?: () => void
  onDelete?: () => void
  onTimeChange?: (placeId: string, field: 'startTime' | 'durationMin', value: string | number) => void
  onToggleStartLock?: (placeId: string) => void
  onToggleDurationLock?: (placeId: string) => void
  onToggleEndLock?: (placeId: string) => void
  onChangeType?: (placeId: string, type: PlaceType) => void
  onSetDayStartLock?: (locked: boolean) => void
  onSetDayDurationLock?: (locked: boolean) => void
  onChangeWindow?: (field: 'dayStart' | 'dayEnd', value: string) => void
  recommendations?: CategoryBuckets
  onAddRecommendation?: (rec: DayRecommendation) => void
  onArchiveRecommendation?: (rec: DayRecommendation) => void
  onDeleteRecommendation?: (rec: DayRecommendation) => void
  backfilling?: Partial<Record<'dessert' | 'attraction' | 'restaurant', boolean>>
  recsHasCenter?: boolean
  onSetRecommendationCenter?: (center: RecommendationCenter) => void
  onClearRecommendationCenter?: () => void
  onRefreshRecommendationCategory?: (category: 'dessert' | 'attraction' | 'restaurant') => void
  recsRefreshing?: Partial<Record<'dessert' | 'attraction' | 'restaurant', boolean>>
  recsError?: string | null
  candidates?: Candidate[]
  archived?: Candidate[]
  onAddReservePlace?: (place: Place) => void
  onAddReservePlaces?: (places: Place[]) => void
  onAddArchivedToDay?: (candidateId: string, place: Place) => void
  onDeleteArchived?: (candidateId: string) => void
  onAddCandidateToDay?: (candidateId: string, place: Place) => void
  onArchiveCandidate?: (candidate: Candidate) => void
  onDeleteCandidate?: (candidateId: string) => void
  sidePanelTab?: SidePanelTab
  onSidePanelTabChange?: (tab: SidePanelTab) => void
  isLastDay?: boolean
  onSmartArrange?: () => void
  onSetAvoid?: (field: 'avoidTraffic' | 'avoidCrowds', value: boolean) => void
  arranging?: boolean
  onChangeLegMode?: (placeId: string, mode: TransportMode) => void
  legBusyPlaceId?: string | null
  onDeletePlace?: (placeId: string) => void
  onArchivePlace?: (place: ScheduledPlace) => void
}

export function ItineraryDay({ day, dayIdx, mode, startDate, isDragging, draggable, isOverflow, onScatter, onDelete, onTimeChange, onToggleStartLock, onToggleDurationLock, onToggleEndLock, onChangeType, onSetDayStartLock, onSetDayDurationLock, onChangeWindow, recommendations, onAddRecommendation, onArchiveRecommendation, onDeleteRecommendation, candidates, archived, onAddReservePlace, onAddReservePlaces, onAddArchivedToDay, onDeleteArchived, onAddCandidateToDay, onArchiveCandidate, onDeleteCandidate, sidePanelTab, onSidePanelTabChange, backfilling, recsHasCenter, onSetRecommendationCenter, onClearRecommendationCenter, onRefreshRecommendationCategory, recsRefreshing, recsError, isLastDay, onSmartArrange, onSetAvoid, arranging, onChangeLegMode, legBusyPlaceId, onDeletePlace, onArchivePlace }: Props) {
  const embedUrl = buildDayEmbedUrl(day.places, mode)
  const { setNodeRef, isOver } = useDroppable({ id: `day-${dayIdx}` })

  return (
    <section className="mb-12" data-testid={`day-${dayIdx}`}>
      <h2 className="font-display text-2xl font-semibold text-ink mb-1 text-balance">
        第 {day.day} 天 · {isOverflow ? '超出行程' : formatDateLabel(dayDate(startDate, day.day))}
      </h2>
      {!isLastDay && day.places.length > 0 && !day.places.some((p) => p.type === 'accommodation') && (
        <p className="text-xs text-warn mb-2">&#x26A0; 這天沒有住宿</p>
      )}
      {isOverflow && (onScatter || onDelete) && (
        <div className="flex gap-2 mb-2">
          {onScatter && (
            <button type="button" onClick={onScatter}
              className="text-xs px-2 py-1 rounded-full border border-warn text-warn hover:bg-warn/10">
              散到其他天
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={onDelete}
              className="text-xs px-2 py-1 rounded-full border border-red-300 text-red-600 hover:bg-red-50">
              刪除這天
            </button>
          )}
        </div>
      )}
      {onChangeWindow && (
        <div className="flex items-center gap-2 mb-2 text-xs text-muted">
          <span>活動</span>
          <input type="time" value={day.dayStart}
            onChange={(e) => onChangeWindow('dayStart', e.target.value)}
            className="border border-border rounded px-1 py-0.5" />
          <span>–</span>
          <input type="time" value={day.dayEnd}
            onChange={(e) => onChangeWindow('dayEnd', e.target.value)}
            className="border border-border rounded px-1 py-0.5" />
          <span>（{((toMin(day.dayEnd) - toMin(day.dayStart)) / 60).toFixed(1)} 小時）</span>
        </div>
      )}
      {(onSetDayStartLock || onSetDayDurationLock) && (() => {
        const has = day.places.length > 0
        const allStart = has && day.places.every((p) => p.startLocked)
        const allDur = has && day.places.every((p) => p.durationLocked)
        return (
          <div className="flex gap-2 mb-2">
            {onSetDayStartLock && (
              <button
                type="button"
                disabled={!has}
                onClick={() => onSetDayStartLock(!allStart)}
                className="text-xs px-2 py-1 rounded-full border border-border hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {allStart ? '🔒' : '🔓'} 整天鎖開始
              </button>
            )}
            {onSetDayDurationLock && (
              <button
                type="button"
                disabled={!has}
                onClick={() => onSetDayDurationLock(!allDur)}
                className="text-xs px-2 py-1 rounded-full border border-border hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {allDur ? '🔒' : '🔓'} 整天鎖停留
              </button>
            )}
          </div>
        )
      })()}
      {(onSmartArrange || onSetAvoid) && (() => {
        const avoidTraffic = day.avoidTraffic ?? true
        const avoidCrowds = day.avoidCrowds ?? true
        const unlockedCount = day.places.filter((p) => !p.startLocked).length
        const disabled = !!arranging || unlockedCount < 2 || (!avoidTraffic && !avoidCrowds)
        return (
          <div className="flex items-center gap-3 mb-2 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={avoidTraffic}
                onChange={(e) => onSetAvoid?.('avoidTraffic', e.target.checked)} />
              避開壅塞
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={avoidCrowds}
                onChange={(e) => onSetAvoid?.('avoidCrowds', e.target.checked)} />
              避開人潮
            </label>
            <button type="button" disabled={disabled} onClick={() => onSmartArrange?.()}
              title={(!avoidTraffic && !avoidCrowds) ? '請至少勾一項' : undefined}
              className="px-2 py-1 rounded-full border border-clay/40 text-clay-deep hover:bg-clay-tint disabled:opacity-40 disabled:cursor-not-allowed">
              {arranging ? '排程中…' : '智慧排程'}
            </button>
          </div>
        )
      })()}
      {day.aiSummary && <p className="text-sm text-muted mb-4">{day.aiSummary}</p>}
      {embedUrl && (
        <div className="rounded-xl overflow-hidden border border-border mb-4" data-testid="day-map-fullwidth">
          <iframe
            src={embedUrl}
            width="100%"
            height="360"
            style={{ border: 0, pointerEvents: isDragging ? 'none' : 'auto' }}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            title={`第 ${day.day} 天路線地圖`}
          />
        </div>
      )}
      <div className="flex gap-6 items-stretch" data-testid="day-content-row">
        <div
          ref={setNodeRef}
          className={`flex-1 space-y-3 rounded-lg transition-colors min-h-[60px] ${isOver ? 'ring-2 ring-clay bg-clay-tint' : ''}`}
        >
          {(() => {
            const byAfter = new Map(
              freeBlocks(day.places, toMin(day.dayEnd)).map((b) => [b.afterId, b] as const)
            )
            return day.places.map((place, i) => {
              const fb = byAfter.get(place.id)
              return (
                <Fragment key={place.id}>
                  <ItineraryCard
                    place={place}
                    index={i}
                    dateIso={dayDate(startDate, day.day)}
                    draggable={draggable}
                    onTimeChange={onTimeChange}
                    onToggleStartLock={onToggleStartLock}
                    onToggleDurationLock={onToggleDurationLock}
                    onToggleEndLock={onToggleEndLock}
                    onChangeType={onChangeType}
                    onChangeLegMode={onChangeLegMode}
                    legBusy={legBusyPlaceId === place.id}
                    onDeletePlace={onDeletePlace}
                    onArchive={onArchivePlace}
                    dayEnd={day.dayEnd}
                  />
                  {fb && (
                    <div
                      data-testid={`free-block-${fb.afterId}`}
                      className="text-xs text-muted bg-paper rounded-lg px-3 py-1.5 flex items-center gap-1"
                    >
                      &#x23F1; 空閒 {formatGap(fb.minutes)}{fb.untilTime ? `（到 ${fb.untilTime}）` : ''}
                    </div>
                  )}
                </Fragment>
              )
            })
          })()}
        </div>
        {onAddRecommendation && (
          <div className="w-96 shrink-0">
            <SidePanel
              dateIso={dayDate(startDate, day.day)}
              recommendations={recommendations}
              onAddRecommendation={onAddRecommendation}
              onArchiveRecommendation={onArchiveRecommendation}
              onDeleteRecommendation={onDeleteRecommendation}
              backfilling={backfilling}
              recsHasCenter={recsHasCenter}
              recsCenter={day.recommendationCenter}
              onSetRecommendationCenter={onSetRecommendationCenter}
              onClearRecommendationCenter={onClearRecommendationCenter}
              onRefreshRecommendationCategory={onRefreshRecommendationCategory}
              recsRefreshing={recsRefreshing}
              recsError={recsError}
              candidates={candidates ?? []}
              archived={archived ?? []}
              onAddReservePlace={onAddReservePlace ?? (() => {})}
              onAddReservePlaces={onAddReservePlaces ?? (() => {})}
              onAddArchivedToDay={onAddArchivedToDay ?? (() => {})}
              onDeleteArchived={onDeleteArchived ?? (() => {})}
              onAddCandidateToDay={onAddCandidateToDay ?? (() => {})}
              onArchiveCandidate={onArchiveCandidate ?? (() => {})}
              onDeleteCandidate={onDeleteCandidate ?? (() => {})}
              activeTab={sidePanelTab}
              onTabChange={onSidePanelTabChange}
            />
          </div>
        )}
      </div>
    </section>
  )
}
