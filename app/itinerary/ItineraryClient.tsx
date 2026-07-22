'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { CollisionDetection, DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { PlanResult, ScheduledPlace, Place, PlaceType, TransportMode, RecommendationsByDay, DayRecommendation, RecommendationCenter, Candidate } from '@/lib/types'
import { recalcPlan } from '@/lib/utils/clientScheduler'
import { addDays, daysBetween, dayDate } from '@/lib/utils/date'
import { legInfo, computeLegPlan } from '@/app/actions/legs'
import { applyTimeEditCascade } from '@/lib/utils/timeEdit'
import { legMerge } from '@/lib/utils/legMerge'
import { ItineraryDay } from '@/components/ItineraryDay'
import { ItineraryCard } from '@/components/ItineraryCard'
import { getDayRecommendations, fetchReplacementRecommendation, refreshDayCategoryRecommendations } from '@/app/actions/recommend'
import { getTripCostUsd } from '@/app/actions/cost'
import { TripCostBadge } from '@/components/TripCostBadge'
import { applyDragResult, findContainer } from '@/lib/utils/dragContainers'
import { findClosestDay } from '@/lib/utils/geo'
import { dayHasRecommendationAnchor, recommendationIdentityKeys, removeRecsDay, resolveDayCenter } from '@/lib/utils/dayRecommend'
import { CombinedInput } from '@/components/CombinedInput'
import { DWELL } from '@/lib/placeType'
import { fetchDayArrangeInputs } from '@/app/actions/arrange'
import { arrangeDayOrder } from '@/lib/utils/arrangeDay'
import { AiRearrangeInput } from '@/components/AiRearrangeInput'
import { createTripSafe, saveTripSafe } from '@/app/actions/trips'
import { archiveCandidate, archivePlace, removeCandidate, unarchivePlace } from '@/app/actions/candidates'
import { listSavedPlaces } from '@/app/actions/savedPlaces'
import { selectCollectionBuckets } from '@/lib/savedPlaces/select'
import type { SavedPlaceRow } from '@/lib/savedPlaces/types'
import { checkLateExit, checkOutsideHours } from '@/lib/utils/hours'
import {
  archivePlaceKey,
  filterRecommendationsByUnavailable,
  inferPlaceIndexSource,
  unavailableRecommendationKeys,
  upsertArchived,
} from '@/lib/itineraryClientState'

type SidePanelTab = 'recommend' | 'line' | 'reserve' | 'collection'
type RecommendationCategory = 'dessert' | 'attraction' | 'restaurant'

// pointerWithin is essential for multi-container: it checks where the pointer
// physically is, not center-to-center distance (closestCenter favors the source container)
const multiContainerCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

// Pure helper — no component state, so defined at module level to avoid exhaustive-deps churn
function renumberDays<T extends { day: number }>(days: T[]): T[] {
  return days.map((d, i) => ({ ...d, day: i + 1 }))
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function refreshPlanWarningsOnly(plan: PlanResult): PlanResult {
  return {
    ...plan,
    days: plan.days.map((day) => {
      const dateIso = dayDate(plan.startDate, day.day)
      const dayStartMin = timeToMin(day.dayStart)
      return {
        ...day,
        places: day.places.map((place) => {
          const startMin = timeToMin(place.startTime)
          return {
            ...place,
            outsideHours: startMin < dayStartMin || checkOutsideHours(place.startTime, place.openingHours, dateIso),
            lateExit: checkLateExit(place.startTime, place.durationMin, place.openingHours, dateIso),
          }
        }),
      }
    }),
  }
}

async function fetchDetailsOnAdd(rec: DayRecommendation, tripId?: string): Promise<Place | null> {
  if (inferPlaceIndexSource(rec.placeId, rec.source) !== 'google') return null
  if (typeof fetch !== 'function') return null
  const params = new URLSearchParams({ placeId: rec.placeId })
  const originalName = rec.localizedName?.original ?? rec.name
  if (originalName) params.set('originalName', originalName)
  if (tripId) params.set('tripId', tripId)

  try {
    const response = await fetch(`/api/place-details?${params.toString()}`)
    if (!response.ok) return null
    const data = await response.json() as { place?: Place | null }
    return data.place ?? null
  } catch {
    return null
  }
}

async function savePlaceIndexOnAdd(place: Pick<Place, 'placeId' | 'name' | 'lat' | 'lng' | 'type' | 'source'>): Promise<void> {
  if (typeof fetch !== 'function' || !place.placeId) return
  try {
    await fetch('/api/place-index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeId: place.placeId,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        category: place.type,
        source: inferPlaceIndexSource(place.placeId, place.source),
      }),
    })
  } catch {
    // Non-critical cache write. Adding to the itinerary must not fail on this.
  }
}

interface Props {
  initial: PlanResult
  tripId?: string
  initialCandidates?: Candidate[]
  initialArchived?: Candidate[]
  initialCostUsd?: number
}

export function ItineraryClient({ initial, tripId, initialCandidates = [], initialArchived = [], initialCostUsd = 0 }: Props) {
  const router = useRouter()
  const [currentTripId, setCurrentTripId] = useState<string | undefined>(tripId)
  // Latest tripId for action callbacks (many use [] deps, so reading the state
  // directly would capture a stale value after the trip is saved mid-session).
  const tripIdRef = useRef<string | undefined>(tripId)
  useEffect(() => { tripIdRef.current = currentTripId }, [currentTripId])
  const [costUsd, setCostUsd] = useState<number>(initialCostUsd)
  const refreshCost = useCallback(async () => {
    const id = tripIdRef.current
    if (!id) return
    try {
      setCostUsd(await getTripCostUsd(id))
    } catch {
      // best-effort; leave the previous estimate in place
    }
  }, [])
  const [plan, setPlan] = useState<PlanResult>(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [targetDays, setTargetDays] = useState<number | null>(null)
  const [recsByDay, setRecsByDay] = useState<RecommendationsByDay | null>(null)
  const recsRef = useRef<RecommendationsByDay | null>(null)
  const photoUnavailableKeysRef = useRef<Set<string>>(new Set())
  const [recsError, setRecsError] = useState<string | null>(null)
  const [backfillKeys, setBackfillKeys] = useState<Set<string>>(new Set())
  const [refreshingKeys, setRefreshingKeys] = useState<Set<string>>(new Set())
  const [arrangingDay, setArrangingDay] = useState<number | null>(null)
  const [arrangeError, setArrangeError] = useState<string | null>(null)
  const [legBusy, setLegBusy] = useState<{ dayIdx: number; placeId: string } | null>(null)
  const [legError, setLegError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>(initialCandidates)
  const candidatesRef = useRef<Candidate[]>(initialCandidates)
  const [archived, setArchivedState] = useState<Candidate[]>(initialArchived)
  const archivedRef = useRef<Candidate[]>(initialArchived)
  const [sidePanelTabs, setSidePanelTabs] = useState<Record<number, SidePanelTab>>({})
  const [collectionRows, setCollectionRows] = useState<SavedPlaceRow[]>([])
  // Ephemeral per-day dismiss set for collection cards (keyed by dayIdx). Not shifted when a
  // day is deleted/scattered — a dismissed card may reappear until reload; acceptable since
  // this is a soft, session-only hide (KNOWN P2, deferred).
  const [collectionExcluded, setCollectionExcluded] = useState<Record<number, string[]>>({})
  useEffect(() => {
    // Graceful: an anonymous session or a load failure just leaves the collection empty —
    // never surface an unhandled rejection from this background load.
    listSavedPlaces().then(setCollectionRows).catch(() => setCollectionRows([]))
  }, [])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // planRef always tracks the latest committed plan (avoids stale closures in dnd-kit callbacks)
  const planRef = useRef<PlanResult>(initial)
  const savedPlanRef = useRef<PlanResult>(initial)
  // true when onDragOver fired for a cross-container move; needed to detect cross-day drag in onDragEnd
  const didCrossRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const updateArchived = useCallback((updater: (current: Candidate[]) => Candidate[]) => {
    const next = updater(archivedRef.current)
    archivedRef.current = next
    setArchivedState(next)
  }, [])

  const updateCandidates = useCallback((updater: (current: Candidate[]) => Candidate[]) => {
    const next = updater(candidatesRef.current)
    candidatesRef.current = next
    setCandidates(next)
  }, [])

  const commitRecs = useCallback((next: RecommendationsByDay | null) => {
    const unavailableKeys = unavailableRecommendationKeys(planRef.current.days, candidatesRef.current, archivedRef.current)
    photoUnavailableKeysRef.current.forEach((key) => unavailableKeys.add(key))
    const filtered = filterRecommendationsByUnavailable(
      next,
      unavailableKeys
    )
    recsRef.current = filtered
    setRecsByDay(filtered)
  }, [])

  const isAlreadyArchived = useCallback((place: Place): boolean => {
    const key = archivePlaceKey(place)
    return archivedRef.current.some((candidate) => archivePlaceKey(candidate.place) === key)
  }, [])

  useEffect(() => {
    let active = true
    getDayRecommendations(planRef.current.days, tripIdRef.current)
      .then((r) => { if (active) { commitRecs(r); setRecsError(null) } })
      .catch(() => { if (active) { commitRecs(null); setRecsError('推薦載入失敗，請稍後再試') } })
      .finally(() => { if (active) void refreshCost() })
    return () => { active = false }
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 匿名：建立 trip
  const ensureTripSaved = useCallback(async (): Promise<string | null> => {
    if (currentTripId) return currentTripId
    try {
      setSaveError(null)
      setSaveState('saving')
      const result = await createTripSafe(planRef.current, '\u672a\u547d\u540d\u884c\u7a0b')
      if (result.ok) {
        setCurrentTripId(result.tripId)
        savedPlanRef.current = planRef.current
        setSaveState('saved')
        window.history.replaceState(null, '', `/itinerary/${result.tripId}`)
        return result.tripId
      }
      if (result.error === 'NOT_AUTHENTICATED') {
        // Don't silently eject the user mid-flow (e.g. tapping 移到備用 on an
        // unsaved trip used to hard-redirect to /login with no explanation).
        const goLogin = typeof window === 'undefined' || window.confirm(
          '這個動作需要先登入並儲存行程。要前往登入嗎？（目前的行程會保留，登入後可繼續）'
        )
        if (goLogin) {
          router.push(`/login?next=${encodeURIComponent('/itinerary')}`)
        } else {
          setSaveState('idle')
        }
      } else {
        setSaveError(result.error)
        setSaveState('error')
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '\u5132\u5b58\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66')
      setSaveState('error')
    }
    return null
  }, [currentTripId, router])

  const onSave = useCallback(async () => {
    await ensureTripSaved()
  }, [ensureTripSaved])

  useEffect(() => {
    if (!currentTripId) return
    if (plan === savedPlanRef.current) return
    setSaveState('saving')
    setSaveError(null)
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(async () => {
      try {
        const result = await saveTripSafe(currentTripId, planRef.current)
        if (result.ok) {
          savedPlanRef.current = planRef.current
          setSaveState('saved')
        } else {
          setSaveError(result.error)
          setSaveState('error')
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : '儲存失敗，請稍後再試')
        setSaveState('error')
      }
    }, 1500)
    return () => { if (autosaveRef.current) clearTimeout(autosaveRef.current) }
  }, [plan, currentTripId])

  // 持久化：重試按鈕直接呼叫 saveTrip（ref sentinel 方式無法重新觸發 effect）
  const onRetry = useCallback(async () => {
    if (!currentTripId) return
    setSaveState('saving')
    setSaveError(null)
    try {
      const result = await saveTripSafe(currentTripId, planRef.current)
      if (result.ok) {
        savedPlanRef.current = planRef.current
        setSaveState('saved')
      } else {
        setSaveError(result.error)
        setSaveState('error')
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗，請稍後再試')
      setSaveState('error')
    }
  }, [currentTripId])

  const commitPlan = useCallback((nextPlan: PlanResult) => {
    planRef.current = nextPlan
    setPlan(nextPlan)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = null
  }, [])

  const scheduleRecalc = useCallback((nextPlan: PlanResult, structural = false) => {
    void structural
    commitPlan(nextPlan)
  }, [commitPlan])

  const toggleLockField = useCallback((dayIdx: number, placeId: string, field: 'startLocked' | 'durationLocked' | 'endLocked') => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        places: d.places.map((p) =>
          p.id === placeId ? { ...p, [field]: !p[field] } : p
        ),
      }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleToggleStartLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'startLocked'),
    [toggleLockField]
  )
  const handleToggleDurationLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'durationLocked'),
    [toggleLockField]
  )
  const handleToggleEndLock = useCallback(
    (dayIdx: number, placeId: string) => toggleLockField(dayIdx, placeId, 'endLocked'),
    [toggleLockField]
  )

  const setDayLockField = useCallback((dayIdx: number, field: 'startLocked' | 'durationLocked', locked: boolean) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return { ...d, places: d.places.map((p) => ({ ...p, [field]: locked })) }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleSetDayStartLock = useCallback(
    (dayIdx: number, locked: boolean) => setDayLockField(dayIdx, 'startLocked', locked),
    [setDayLockField]
  )
  const handleSetDayDurationLock = useCallback(
    (dayIdx: number, locked: boolean) => setDayLockField(dayIdx, 'durationLocked', locked),
    [setDayLockField]
  )

  const handleChangeType = useCallback((dayIdx: number, placeId: string, type: PlaceType) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      return {
        ...d,
        places: d.places.map((p) =>
          p.id === placeId ? { ...p, type } : p
        ),
      }
    })
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)
  }, [])

  const handleChangeLegMode = useCallback(async (dayIdx: number, placeId: string, mode: TransportMode) => {
    const day = planRef.current.days[dayIdx]
    const idx = day.places.findIndex((p) => p.id === placeId)
    const next = day.places[idx + 1]
    if (!next) return
    setLegError(null)
    setLegBusy({ dayIdx, placeId })
    try {
      const { travelMin, travelDistanceM } = await legInfo(day.places[idx], next, mode, tripIdRef.current)
      const newDays = planRef.current.days.map((d, i) =>
        i !== dayIdx ? d : {
          ...d,
          places: d.places.map((p) =>
            p.id === placeId ? { ...p, legMode: mode, travelMinToNext: travelMin, travelDistanceToNext: travelDistanceM, legManualNext: next.id } : p
          ),
        }
      )
      const recalced = recalcPlan({ ...planRef.current, days: newDays })
      planRef.current = recalced
      setPlan(recalced)
    } catch {
      setLegError('交通時間計算失敗')
    } finally {
      setLegBusy(null)
      void refreshCost()
    }
  }, [refreshCost])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id))
    savedPlanRef.current = planRef.current
    didCrossRef.current = false
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setPlan(prev => {
      const sourceIdx = findContainer(String(active.id), prev.days)
      const targetIdx = findContainer(String(over.id), prev.days)
      if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return prev
      const next = applyDragResult(prev, String(active.id), String(over.id))
      planRef.current = next
      didCrossRef.current = true
      return next
    })
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    const didCross = didCrossRef.current
    didCrossRef.current = false

    if (!over || active.id === over.id) {
      if (didCross) scheduleRecalc(planRef.current, true)
      return
    }

    if (didCross) {
      scheduleRecalc(planRef.current, true)
    } else {
      const current = planRef.current
      const nextPlan = applyDragResult(current, String(active.id), String(over.id))
      scheduleRecalc(nextPlan !== current ? nextPlan : current, true)
    }
  }, [scheduleRecalc])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    didCrossRef.current = false
    const saved = savedPlanRef.current
    planRef.current = saved
    setPlan(saved)
  }, [])

  const handleTimeChange = useCallback(
    (dayIdx: number, placeId: string, field: 'startTime' | 'durationMin', value: string | number) => {
      // TASK-023: editing start/duration is a soft anchor for this one cascade — the
      // cascade function already recomputes neighbor positions and warnings, so this
      // bypasses scheduleRecalc/recalcPlan (same pattern as toggleLockField) rather than
      // routing through it, which would otherwise treat the edited card as unlocked and
      // reflow it back from day-start, snapping the edit back (the original bug).
      const day = planRef.current.days[dayIdx]
      const dateIso = dayDate(planRef.current.startDate, day.day)
      const dayStartMin = timeToMin(day.dayStart)
      const newPlaces = applyTimeEditCascade(day.places, placeId, field, value, dateIso, dayStartMin)
      const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, places: newPlaces } : d))
      const newPlan = { ...planRef.current, days: newDays }
      planRef.current = newPlan
      setPlan(newPlan)
    },
    []
  )

  const handleAddPlace = useCallback((place: Place) => {
    const newPlace: ScheduledPlace = {
      ...place,
      startTime: '09:00',
      durationMin: DWELL[place.type],
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }
    const targetDayIdx = findClosestDay(planRef.current.days, place)
    const newDays = planRef.current.days.map((d, i) =>
      i === targetDayIdx ? { ...d, places: [...d.places, newPlace] } : d
    )
    scheduleRecalc({ ...planRef.current, days: newDays }, true)
  }, [scheduleRecalc])

  const handleAddPlaces = useCallback((places: Place[]) => {
    let next = planRef.current
    places.forEach((place) => {
      const newPlace: ScheduledPlace = {
        ...place,
        startTime: '09:00',
        durationMin: DWELL[place.type],
        travelMinToNext: null,
        aiDescription: null,
        outsideHours: false,
        lateExit: false,
        startLocked: false,
        durationLocked: false,
      }
      const targetDayIdx = findClosestDay(next.days, place)
      next = {
        ...next,
        days: next.days.map((d, i) =>
          i === targetDayIdx ? { ...d, places: [...d.places, newPlace] } : d
        ),
      }
    })
    scheduleRecalc(next, true)
  }, [scheduleRecalc])

  const showActionError = useCallback((fallback: string, error: unknown) => {
    setActionError(error instanceof Error ? error.message : fallback)
  }, [])

  const handleAddReservePlace = useCallback(async (place: Place) => {
    if (isAlreadyArchived(place)) {
      commitRecs(recsRef.current)
      setActionError(null)
      return
    }
    const targetTripId = currentTripId ?? await ensureTripSaved()
    if (!targetTripId) return
    try {
      const { id } = await archivePlace(targetTripId, place)
      updateArchived((current) => upsertArchived(current, { id, place, addedBy: 'me', addedByName: '\u4f60', source: null }))
      commitRecs(recsRef.current)
      setActionError(null)
    } catch (error) {
      console.error('[reserve] failed to add reserve place', { tripId: targetTripId, placeId: place.placeId || place.id }, error)
      showActionError('加入備用行程失敗，請稍後再試', error)
    }
  }, [currentTripId, ensureTripSaved, showActionError, updateArchived, commitRecs, isAlreadyArchived])

  const handleAddReservePlaces = useCallback((places: Place[]) => {
    places.forEach((place) => { void handleAddReservePlace(place) })
  }, [handleAddReservePlace])

  const handleSidePanelTabChange = useCallback((dayIdx: number, tab: SidePanelTab) => {
    setSidePanelTabs((current) => current[dayIdx] === tab ? current : { ...current, [dayIdx]: tab })
  }, [])

  const pendingArchiveId = useCallback((place: Place) => `pending-${place.id || place.placeId}`, [])

  const handleArchivePlace = useCallback(async (dayIdx: number, place: Place) => {
    const alreadyArchived = isAlreadyArchived(place)
    const targetTripId = alreadyArchived ? currentTripId : currentTripId ?? await ensureTripSaved()
    if (!alreadyArchived && !targetTripId) return
    const previousPlan = planRef.current
    const previousRecs = recsRef.current
    const optimisticDays = previousPlan.days.map((day, index) =>
      index === dayIdx ? { ...day, places: day.places.filter((currentPlace) => currentPlace.id !== place.id) } : day
    )
    scheduleRecalc({ ...previousPlan, days: optimisticDays }, true)
    if (alreadyArchived) {
      commitRecs(previousRecs)
      setActionError(null)
      return
    }
    if (!targetTripId) return
    const pendingId = pendingArchiveId(place)
    updateArchived((current) => upsertArchived(current, { id: pendingId, place, addedBy: 'me', addedByName: '\u4f60', source: null }))
    commitRecs(recsRef.current)
    try {
      const { id } = await archivePlace(targetTripId, place)
      updateArchived((current) => upsertArchived(current, { id, place, addedBy: 'me', addedByName: '\u4f60', source: null }, pendingId))
      commitRecs(recsRef.current)
      setActionError(null)
    } catch (error) {
      planRef.current = previousPlan
      setPlan(previousPlan)
      updateArchived((current) => current.filter((candidate) => candidate.id !== pendingId))
      commitRecs(previousRecs)
      console.error('[reserve] failed to archive itinerary card', { tripId: targetTripId, placeId: place.placeId || place.id }, error)
      showActionError('\u79fb\u5230\u5099\u7528\u884c\u7a0b\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002', error)
    }
  }, [currentTripId, ensureTripSaved, pendingArchiveId, scheduleRecalc, showActionError, updateArchived, commitRecs, isAlreadyArchived])

  const handleArchiveRecommendation = useCallback(async (dayIdx: number, rec: DayRecommendation) => {
    if (isAlreadyArchived(rec)) {
      commitRecs(recsRef.current)
      setActionError(null)
      return
    }
    const targetTripId = currentTripId ?? await ensureTripSaved()
    if (!targetTripId) return
    const pendingId = pendingArchiveId(rec)
    const previousRecs = recsRef.current
    updateArchived((current) => upsertArchived(current, { id: pendingId, place: rec, addedBy: 'me', addedByName: '\u4f60', source: null }))
    commitRecs(previousRecs)
    try {
      const { id } = await archivePlace(targetTripId, rec)
      updateArchived((current) => upsertArchived(current, { id, place: rec, addedBy: 'me', addedByName: '\u4f60', source: null }, pendingId))
      commitRecs(recsRef.current)
      setActionError(null)
    } catch (error) {
      updateArchived((current) => current.filter((candidate) => candidate.id !== pendingId))
      commitRecs(previousRecs)
      console.error('[reserve] failed to archive recommendation card', { tripId: targetTripId, placeId: rec.placeId || rec.id }, error)
      showActionError('\u79fb\u5230\u5099\u7528\u884c\u7a0b\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002', error)
    }
  }, [currentTripId, ensureTripSaved, pendingArchiveId, commitRecs, showActionError, updateArchived, isAlreadyArchived])

  const handleAddArchivedToDay = useCallback(async (candidateId: string, place: Place, dayIndex: number) => {
    const newPlace: ScheduledPlace = {
      ...place,
      startTime: '09:00',
      durationMin: DWELL[place.type],
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }
    try {
      await unarchivePlace(candidateId)
      const newDays = planRef.current.days.map((d, i) =>
        i === dayIndex ? { ...d, places: [...d.places, newPlace] } : d
      )
      scheduleRecalc({ ...planRef.current, days: newDays }, true)
      updateArchived((a) => a.filter((c) => c.id !== candidateId))
      setActionError(null)
    } catch (error) {
      showActionError('加入行程失敗，請稍後再試', error)
    }
  }, [scheduleRecalc, showActionError, updateArchived])

  const handleDeleteArchived = useCallback(async (candidateId: string) => {
    const previousArchived = archivedRef.current
    updateArchived((a) => a.filter((c) => c.id !== candidateId))
    try {
      await unarchivePlace(candidateId)
      setActionError(null)
    } catch (error) {
      updateArchived(() => previousArchived)
      showActionError('刪除備用行程失敗，請稍後再試', error)
    }
  }, [showActionError, updateArchived])

  const handleAddCandidateToDay = useCallback(async (candidateId: string, place: Place, dayIndex: number) => {
    try {
      await removeCandidate(candidateId)
      const newPlace: ScheduledPlace = {
        ...place,
        id: crypto.randomUUID(),
        startTime: '09:00',
        durationMin: DWELL[place.type],
        travelMinToNext: null,
        aiDescription: null,
        outsideHours: false,
        lateExit: false,
        startLocked: false,
        durationLocked: false,
      }
      const newDays = planRef.current.days.map((d, i) =>
        i === dayIndex ? { ...d, places: [...d.places, newPlace] } : d
      )
      scheduleRecalc({ ...planRef.current, days: newDays }, true)
      updateCandidates((current) => current.filter((candidate) => candidate.id !== candidateId))
      void savePlaceIndexOnAdd(newPlace)
      setActionError(null)
    } catch (error) {
      showActionError('\u52a0\u5165\u884c\u7a0b\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002', error)
    }
  }, [scheduleRecalc, showActionError, updateCandidates])

  const handleArchiveCandidate = useCallback(async (candidate: Candidate) => {
    try {
      const { id } = await archiveCandidate(candidate.id)
      updateCandidates((current) => current.filter((item) => item.id !== candidate.id))
      updateArchived((current) => upsertArchived(current, { ...candidate, id }))
      commitRecs(recsRef.current)
      setActionError(null)
    } catch (error) {
      showActionError('\u79fb\u5230\u5099\u7528\u884c\u7a0b\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002', error)
    }
  }, [commitRecs, showActionError, updateArchived, updateCandidates])

  const handleDeleteCandidate = useCallback(async (candidateId: string) => {
    const previousCandidates = candidatesRef.current
    updateCandidates((current) => current.filter((candidate) => candidate.id !== candidateId))
    try {
      await removeCandidate(candidateId)
      setActionError(null)
    } catch (error) {
      updateCandidates(() => previousCandidates)
      showActionError('\u522a\u9664 LINE \u8a0e\u8ad6\u884c\u7a0b\u5931\u6557\uff0c\u8acb\u7a0d\u5f8c\u518d\u8a66\u3002', error)
    }
  }, [showActionError, updateCandidates])

  const buildExcludeIds = useCallback((): string[] => {
    const ids = new Set<string>()
    const addPlace = (place: Place) => {
      recommendationIdentityKeys(place).forEach((key) => ids.add(key))
    }
    planRef.current.days.forEach((d) => d.places.forEach(addPlace))
    candidatesRef.current.forEach((candidate) => addPlace(candidate.place))
    archivedRef.current.forEach((candidate) => addPlace(candidate.place))
    const cur = recsRef.current
    if (cur) {
      cur.forEach((b) =>
        (['dessert', 'attraction', 'restaurant'] as const).forEach((c) => {
          b[c].shown.forEach(addPlace)
          b[c].reserve.forEach(addPlace)
        })
      )
    }
    photoUnavailableKeysRef.current.forEach((key) => ids.add(key))
    return Array.from(ids)
  }, [])

  // 智慧排程單日核心：只有使用者按「智慧排程」時才會重排順序與時間。
  const arrangeDay = useCallback(async (dayIdx: number) => {
    const current = planRef.current
    const day = current.days[dayIdx]
    const inputs = await fetchDayArrangeInputs(
      day.places, current.transportMode, day.avoidCrowds ?? true, tripIdRef.current
    )
    const reordered = arrangeDayOrder(
      day,
      dayDate(current.startDate, day.day),
      inputs,
      { avoidTraffic: day.avoidTraffic ?? true, avoidCrowds: day.avoidCrowds ?? true }
    )
    let arrangedPlaces = reordered
    try {
      setLegError(null)
      arrangedPlaces = legMerge(reordered, await computeLegPlan(reordered, tripIdRef.current))
    } catch {
      setLegError('交通時間計算失敗')
    }
    const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, places: arrangedPlaces } : d))
    const recalced = recalcPlan({ ...planRef.current, days: newDays })
    commitPlan(recalced)
    void refreshCost()
  }, [commitPlan, refreshCost])

  const removeRecommendationFromShown = useCallback(
    (dayIdx: number, rec: DayRecommendation, extraExcludeIds: string[] = []) => {
      const cat = rec.type as RecommendationCategory
      const prev = recsRef.current
      if (!prev || !prev[dayIdx]) return
      const removedKeys = new Set(recommendationIdentityKeys(rec))
      const bucket = prev[dayIdx][cat]
      const shownAfter = bucket.shown.filter((r) =>
        !recommendationIdentityKeys(r).some((key) => removedKeys.has(key))
      )
      const reserve = bucket.reserve.filter((r) =>
        !recommendationIdentityKeys(r).some((key) => removedKeys.has(key))
      )
      while (shownAfter.length < 5 && reserve.length > 0) {
        const nextReserve = reserve.shift()
        if (nextReserve) shownAfter.push(nextReserve)
      }
      const missingCount = Math.max(0, 5 - shownAfter.length)
      const updated: RecommendationsByDay = prev.map((b, i) =>
        i === dayIdx ? { ...b, [cat]: { shown: shownAfter, reserve } } : b
      )
      commitRecs(updated)

      if (missingCount > 0) {
        const key = `${dayIdx}:${cat}`
        setBackfillKeys((s) => new Set(s).add(key))
        ;(async () => {
          for (let i = 0; i < missingCount; i += 1) {
            const excludeIds = Array.from(new Set([...buildExcludeIds(), ...extraExcludeIds]))
            const repl = await fetchReplacementRecommendation(planRef.current.days[dayIdx], cat, excludeIds, tripIdRef.current)
            if (!repl) break
            const cur = recsRef.current
            if (!cur || !cur[dayIdx]) break
            const currentExcludeIds = new Set([...buildExcludeIds(), ...extraExcludeIds])
            if (recommendationIdentityKeys(repl).some((key) => currentExcludeIds.has(key))) break
            const b = cur[dayIdx][cat]
            if (b.shown.length >= 5) break
            const next2: RecommendationsByDay = cur.map((x, idx) =>
              idx === dayIdx ? { ...x, [cat]: { shown: [...b.shown, repl], reserve: b.reserve } } : x
            )
            commitRecs(next2)
          }
        })()
          .catch(() => { /* leave slot empty */ })
          .finally(() => {
            setBackfillKeys((s) => { const n = new Set(s); n.delete(key); return n })
            void refreshCost()
          })
      }
    },
    [buildExcludeIds, commitRecs, refreshCost],
  )

  const handleRecommendationPhotoUnavailable = useCallback((dayIdx: number, rec: DayRecommendation) => {
    const keys = recommendationIdentityKeys(rec)
    if (keys.length === 0) return
    const unavailableKeys = photoUnavailableKeysRef.current
    const hasNewKey = keys.some((key) => !unavailableKeys.has(key))
    if (!hasNewKey) return
    keys.forEach((key) => unavailableKeys.add(key))
    removeRecommendationFromShown(dayIdx, rec, keys)
  }, [removeRecommendationFromShown])

  const handleAddRecommendation = useCallback(async (dayIdx: number, rec: DayRecommendation) => {
    const needsDetails = !rec.openingHours?.length
    const details = needsDetails ? await fetchDetailsOnAdd(rec, tripIdRef.current) : null
    if (needsDetails) void refreshCost()
    const enriched = details
      ? {
        ...rec,
        ...details,
        id: rec.id,
        placeId: rec.placeId,
        type: rec.type,
        localizedName: details.localizedName ?? rec.localizedName,
        localizedAddress: details.localizedAddress ?? rec.localizedAddress,
        reason: rec.reason,
        sourceLabel: rec.sourceLabel,
      }
      : rec

    const newPlace: ScheduledPlace = {
      id: crypto.randomUUID(),
      placeId: enriched.placeId,
      source: enriched.source,
      name: enriched.name,
      localizedName: enriched.localizedName,
      type: rec.type,
      lat: enriched.lat,
      lng: enriched.lng,
      address: enriched.address,
      localizedAddress: enriched.localizedAddress,
      openingHours: enriched.openingHours,
      rating: enriched.rating,
      photoUrl: enriched.photoUrl,
      photoUrls: enriched.photoUrls,
      description: enriched.description,
      startTime: '09:00',
      durationMin: DWELL[rec.type],
      travelMinToNext: null,
      aiDescription: null,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }
    const newDays = planRef.current.days.map((d, i) =>
      i === dayIdx ? { ...d, places: [...d.places, newPlace] } : d
    )
    commitPlan({ ...planRef.current, days: newDays })
    void savePlaceIndexOnAdd(newPlace)

    removeRecommendationFromShown(dayIdx, rec, [rec.placeId])
  }, [commitPlan, refreshCost, removeRecommendationFromShown])

  const handleDeleteRecommendation = useCallback((dayIdx: number, rec: DayRecommendation) => {
    removeRecommendationFromShown(dayIdx, rec, [rec.placeId])
  }, [removeRecommendationFromShown])

  // Collection tab (地圖收藏): reuse the recommendation add/archive paths over saved-places
  // cards. Add appends to the day (placeId then falls out of the collection buckets next
  // render); archive/dismiss use a per-day exclude set so the card leaves the suggestion.
  const handleAddCollectionPlace = useCallback((dayIdx: number, rec: DayRecommendation) => {
    void handleAddRecommendation(dayIdx, rec)
  }, [handleAddRecommendation])

  const handleDismissCollection = useCallback((dayIdx: number, rec: DayRecommendation) => {
    setCollectionExcluded((current) => ({
      ...current,
      [dayIdx]: [...(current[dayIdx] ?? []), rec.placeId],
    }))
  }, [])

  // Archive moves the place into the 備用行程 pool but keeps it in the (cross-trip) collection
  // suggestions — you may still want it on another day, and only 刪除 (dismiss) hides it. This
  // also sidesteps a "archive failed but the card vanished" mismatch, since
  // handleArchiveRecommendation swallows failures internally.
  const handleArchiveCollection = useCallback((dayIdx: number, rec: DayRecommendation) => {
    void handleArchiveRecommendation(dayIdx, rec)
  }, [handleArchiveRecommendation])

  const handleCollectionImported = useCallback(() => {
    listSavedPlaces().then(setCollectionRows).catch(() => {})
  }, [])

  // TASK-010: manual recommendation center — persists to the day, then refetches that day's 3 categories.
  const setDayRecommendationCenter = useCallback((dayIdx: number, center: RecommendationCenter | null) => {
    const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, recommendationCenter: center } : d))
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)

    getDayRecommendations([newDays[dayIdx]], tripIdRef.current)
      .then((r) => {
        const cur = recsRef.current
        if (!cur || !cur[dayIdx]) return
        commitRecs(cur.map((b, i) => (i === dayIdx ? r[0] : b)))
      })
      .catch(() => { /* recoverable: keep previous cards on refetch failure */ })
      .finally(() => { void refreshCost() })
  }, [commitRecs, refreshCost])

  const handleSetRecommendationCenter = useCallback(
    (dayIdx: number, center: RecommendationCenter) => setDayRecommendationCenter(dayIdx, center),
    [setDayRecommendationCenter]
  )
  const handleClearRecommendationCenter = useCallback(
    (dayIdx: number) => setDayRecommendationCenter(dayIdx, null),
    [setDayRecommendationCenter]
  )

  // TASK-010: 換一批 — replace one day/category's shown set, preserving unrelated buckets.
  const handleRefreshCategory = useCallback((dayIdx: number, category: 'dessert' | 'attraction' | 'restaurant') => {
    if (!dayHasRecommendationAnchor(planRef.current.days[dayIdx])) return
    const center = resolveDayCenter(planRef.current.days, dayIdx)
    if (!center) return
    const key = `${dayIdx}:${category}`
    setRefreshingKeys((s) => new Set(s).add(key))
    const excludeIds = buildExcludeIds()
    refreshDayCategoryRecommendations({ category, center, excludeIds, tripId: tripIdRef.current })
      .then((replacements) => {
        if (replacements.length === 0) return   // recoverable: keep previous cards
        const cur = recsRef.current
        if (!cur || !cur[dayIdx]) return
        commitRecs(cur.map((b, i) =>
          i === dayIdx ? { ...b, [category]: { shown: replacements, reserve: b[category].reserve } } : b
        ))
      })
      .catch(() => { /* recoverable: keep previous cards */ })
      .finally(() => {
        setRefreshingKeys((s) => { const n = new Set(s); n.delete(key); return n })
        void refreshCost()
      })
  }, [buildExcludeIds, commitRecs, refreshCost])

  const handleChangeStartDate = useCallback((iso: string) => {
    commitPlan(refreshPlanWarningsOnly({ ...planRef.current, startDate: iso }))
  }, [commitPlan])

  const handleChangeEndDate = useCallback((iso: string) => {
    const start = planRef.current.startDate
    const targetN = Math.max(1, daysBetween(start, iso < start ? start : iso))
    const M = planRef.current.days.length
    if (targetN > M) {
      const extra = Array.from({ length: targetN - M }, (_, k) => ({
        day: M + k + 1, places: [], aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
      }))
      const newPlan = { ...planRef.current, days: [...planRef.current.days, ...extra] }
      planRef.current = newPlan
      setPlan(newPlan)
      setTargetDays(null)
    } else {
      // 縮短：不刪改，交由 §5（Task 5）的警告/解決；這裡只記錄目標 N
      setTargetDays(targetN)
    }
  }, [])

  const handleChangeDayWindow = useCallback((dayIdx: number, field: 'dayStart' | 'dayEnd', value: string) => {
    const newDays = planRef.current.days.map((d, i) => {
      if (i !== dayIdx) return d
      // dayEnd 不可早於 dayStart：若反向則夾到 dayStart
      const next = field === 'dayEnd' && value < d.dayStart ? d.dayStart : value
      return { ...d, [field]: next }
    })
    commitPlan(refreshPlanWarningsOnly({ ...planRef.current, days: newDays }))
  }, [commitPlan])

  const handleDeletePlace = useCallback((dayIdx: number, placeId: string) => {
    const newDays = planRef.current.days.map((d, i) =>
      i === dayIdx ? { ...d, places: d.places.filter((p) => p.id !== placeId) } : d
    )
    scheduleRecalc({ ...planRef.current, days: newDays }, true)
  }, [scheduleRecalc])

  const handleDeleteDay = useCallback((dayIdx: number) => {
    const next = renumberDays(planRef.current.days.filter((_, i) => i !== dayIdx))
    commitPlan({ ...planRef.current, days: next })
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
    commitRecs(removeRecsDay(recsRef.current, dayIdx))   // keep recs index-aligned with days
  }, [commitPlan, commitRecs])

  const handleScatterDay = useCallback((dayIdx: number) => {
    const src = planRef.current.days[dayIdx]
    const kept = planRef.current.days.filter((_, i) => i !== dayIdx)
    let working = kept
    src.places.forEach((p) => {
      const target = findClosestDay(working, p)
      working = working.map((d, i) => i === target ? { ...d, places: [...d.places, { ...p, travelMinToNext: null }] } : d)
    })
    const next = renumberDays(working)
    commitPlan({ ...planRef.current, days: next })
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
    commitRecs(removeRecsDay(recsRef.current, dayIdx))   // keep recs index-aligned with days
  }, [commitPlan, commitRecs])

  const handleSetAvoid = useCallback(
    (dayIdx: number, field: 'avoidTraffic' | 'avoidCrowds', value: boolean) => {
      const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, [field]: value } : d))
      const newPlan = { ...planRef.current, days: newDays }
      planRef.current = newPlan
      setPlan(newPlan)
    },
    []
  )

  const handleSmartArrange = useCallback(async (dayIdx: number) => {
    setArrangeError(null)
    setArrangingDay(dayIdx)
    try {
      await arrangeDay(dayIdx)
    } catch {
      setArrangeError('排程失敗，請稍後再試')
    } finally {
      setArrangingDay(null)
    }
  }, [arrangeDay])

  const handleAiApply = useCallback((newPlan: PlanResult) => {
    commitPlan(newPlan)
  }, [commitPlan])

  const N = targetDays ?? plan.days.length
  const overCount = Math.max(0, plan.days.length - N)

  const allPlaces = plan.days.flatMap((d) => d.places)
  const activePlace = activeId ? allPlaces.find(p => p.id === activeId) ?? null : null
  const activePlaceIndex = activeId ? allPlaces.findIndex(p => p.id === activeId) : -1

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="text-clay text-sm inline-block">&#x2190; 重新規劃</a>
        {currentTripId && <TripCostBadge usd={costUsd} />}
        {currentTripId ? (
          <span className="text-sm text-muted">
            {saveState === 'saving' && '儲存中…'}
            {saveState === 'saved' && '已儲存'}
            {saveState === 'error' && (
              <button
                onClick={onRetry}
                className="text-red-600 underline"
              >
                {saveError ? `儲存失敗：${saveError}` : '儲存失敗，點此重試'}
              </button>
            )}
          </span>
        ) : (
          <span className="flex flex-col items-end gap-1">
            <button onClick={onSave} className="text-sm border border-clay text-clay-deep rounded-md px-3 py-1 hover:bg-clay-tint">
              儲存行程
            </button>
            {saveState === 'error' && (
              <span className="text-xs text-red-600">
                {saveError ? `儲存失敗：${saveError}` : '儲存失敗，請稍後再試'}
              </span>
            )}
          </span>
        )}
      </div>
      {actionError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {actionError}
        </p>
      )}
      <section className="mb-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">開始日期</span>
          <input type="date" data-testid="trip-start-date" value={plan.startDate}
            onChange={(e) => handleChangeStartDate(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">結束日期</span>
          <input type="date" data-testid="trip-end-date" min={plan.startDate}
            value={dayDate(plan.startDate, plan.days.length)}
            onChange={(e) => handleChangeEndDate(e.target.value)}
            className="border border-border rounded-lg px-3 py-1.5 text-sm" />
        </label>
        <div className="flex items-center gap-1 pb-1.5">
          <span className="text-sm text-muted">共 {plan.days.length} 天</span>
          <div className="flex flex-col" data-testid="day-count-stepper">
            <button
              type="button"
              aria-label="增加一天"
              data-testid="day-count-stepper-up"
              onClick={() => handleChangeEndDate(addDays(dayDate(plan.startDate, N), 1))}
              className="text-xs px-2 py-1 rounded-full border border-border hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label="減少一天"
              data-testid="day-count-stepper-down"
              disabled={N <= 1}
              onClick={() => handleChangeEndDate(addDays(dayDate(plan.startDate, N), -1))}
              className="text-xs px-2 py-1 rounded-full border border-border hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ▼
            </button>
          </div>
        </div>
      </section>
      {overCount > 0 && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-700">
          行程天數（{plan.days.length}）大於設定天數（{N}），請處理超出的天。
        </div>
      )}
      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold text-ink">新增行程</h2>
        <CombinedInput onAdd={handleAddPlace} onAddPlaces={handleAddPlaces} />
      </section>
      <DndContext
        sensors={sensors}
        collisionDetection={multiContainerCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <AiRearrangeInput plan={plan} onApply={handleAiApply} />
        {arrangeError && (
          <p className="text-sm text-red-600 mb-4" role="alert">{arrangeError}</p>
        )}
        {legError && <p className="text-sm text-red-600 mb-4" role="alert">{legError}</p>}
        <div>
          {plan.days.map((day, dayIdx) => (
            <SortableContext
              key={day.day}
              items={day.places.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <ItineraryDay
                day={day}
                dayIdx={dayIdx}
                mode={plan.transportMode}
                startDate={plan.startDate}
                isDragging={activeId !== null}
                onTimeChange={(placeId, field, value) =>
                  handleTimeChange(dayIdx, placeId, field, value)
                }
                onToggleStartLock={(placeId) => handleToggleStartLock(dayIdx, placeId)}
                onToggleDurationLock={(placeId) => handleToggleDurationLock(dayIdx, placeId)}
                onToggleEndLock={(placeId) => handleToggleEndLock(dayIdx, placeId)}
                onChangeType={(placeId, type) => handleChangeType(dayIdx, placeId, type)}
                onSetDayStartLock={(locked) => handleSetDayStartLock(dayIdx, locked)}
                onSetDayDurationLock={(locked) => handleSetDayDurationLock(dayIdx, locked)}
                onChangeWindow={(field, value) => handleChangeDayWindow(dayIdx, field, value)}
                isOverflow={dayIdx >= N}
                isLastDay={dayIdx === plan.days.length - 1}
                onScatter={() => handleScatterDay(dayIdx)}
                onDelete={() => handleDeleteDay(dayIdx)}
                onSmartArrange={() => handleSmartArrange(dayIdx)}
                onSetAvoid={(field, value) => handleSetAvoid(dayIdx, field, value)}
                arranging={arrangingDay === dayIdx}
                draggable
                recommendations={recsByDay?.[dayIdx]}
                onAddRecommendation={(rec) => handleAddRecommendation(dayIdx, rec)}
                onArchiveRecommendation={(rec) => handleArchiveRecommendation(dayIdx, rec)}
                onDeleteRecommendation={(rec) => handleDeleteRecommendation(dayIdx, rec)}
                onRecommendationPhotoUnavailable={(rec) => handleRecommendationPhotoUnavailable(dayIdx, rec)}
                candidates={candidates}
                archived={archived}
                onAddReservePlace={handleAddReservePlace}
                onAddReservePlaces={handleAddReservePlaces}
                onAddArchivedToDay={(candidateId, place) => handleAddArchivedToDay(candidateId, place, dayIdx)}
                onDeleteArchived={handleDeleteArchived}
                onAddCandidateToDay={(candidateId, place) => handleAddCandidateToDay(candidateId, place, dayIdx)}
                onArchiveCandidate={handleArchiveCandidate}
                onDeleteCandidate={handleDeleteCandidate}
                onArchivePlace={(place) => handleArchivePlace(dayIdx, place)}
                sidePanelTab={sidePanelTabs[dayIdx]}
                onSidePanelTabChange={(tab) => handleSidePanelTabChange(dayIdx, tab)}
                collectionBuckets={selectCollectionBuckets(
                  collectionRows,
                  resolveDayCenter(plan.days, dayIdx),
                  new Set([...(collectionExcluded[dayIdx] ?? []), ...day.places.map((p) => p.placeId)]),
                )}
                onAddCollectionPlace={(rec) => handleAddCollectionPlace(dayIdx, rec)}
                onArchiveCollection={(rec) => handleArchiveCollection(dayIdx, rec)}
                onDismissCollection={(rec) => handleDismissCollection(dayIdx, rec)}
                onCollectionImported={handleCollectionImported}
                backfilling={{
                  dessert: backfillKeys.has(`${dayIdx}:dessert`),
                  attraction: backfillKeys.has(`${dayIdx}:attraction`),
                  restaurant: backfillKeys.has(`${dayIdx}:restaurant`),
                }}
                recsHasCenter={dayHasRecommendationAnchor(day)}
                onSetRecommendationCenter={(center) => handleSetRecommendationCenter(dayIdx, center)}
                onClearRecommendationCenter={() => handleClearRecommendationCenter(dayIdx)}
                onRefreshRecommendationCategory={(category) => handleRefreshCategory(dayIdx, category)}
                recsRefreshing={{
                  dessert: refreshingKeys.has(`${dayIdx}:dessert`),
                  attraction: refreshingKeys.has(`${dayIdx}:attraction`),
                  restaurant: refreshingKeys.has(`${dayIdx}:restaurant`),
                }}
                recsError={recsError}
                onChangeLegMode={(placeId, mode) => handleChangeLegMode(dayIdx, placeId, mode)}
                legBusyPlaceId={legBusy?.dayIdx === dayIdx ? legBusy.placeId : null}
                onDeletePlace={(placeId) => handleDeletePlace(dayIdx, placeId)}
              />
            </SortableContext>
          ))}
        </div>
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            aria-label="增加一天"
            data-testid="bottom-add-day"
            onClick={() => handleChangeEndDate(addDays(dayDate(plan.startDate, N), 1))}
            className="border border-border rounded-lg px-3 py-1.5 text-sm hover:bg-paper"
          >
            + 加一天
          </button>
          <button
            type="button"
            aria-label="回到頂部"
            data-testid="scroll-to-top"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="border border-border rounded-lg px-3 py-1.5 text-sm hover:bg-paper"
          >
            ↑ 回到頂部
          </button>
        </div>
        <DragOverlay>
          {activePlace ? (
            <div className="shadow-2xl rotate-1 opacity-95">
              <ItineraryCard
                place={activePlace}
                index={activePlaceIndex}
                dateIso={plan.startDate}
                draggable={false}
                compact
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  )
}
