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
import { applyTimeEdit } from '@/lib/utils/timeEdit'
import { legMerge } from '@/lib/utils/legMerge'
import { ItineraryDay } from '@/components/ItineraryDay'
import { ItineraryCard } from '@/components/ItineraryCard'
import { getDayRecommendations, fetchReplacementRecommendation, refreshDayCategoryRecommendations } from '@/app/actions/recommend'
import { applyDragResult, findContainer } from '@/lib/utils/dragContainers'
import { findClosestDay } from '@/lib/utils/geo'
import { removeRecsDay, resolveDayCenter } from '@/lib/utils/dayRecommend'
import { CombinedInput } from '@/components/CombinedInput'
import { DWELL } from '@/lib/placeType'
import { fetchDayArrangeInputs } from '@/app/actions/arrange'
import { arrangeDayOrder } from '@/lib/utils/arrangeDay'
import { AiRearrangeInput } from '@/components/AiRearrangeInput'
import { createTripSafe, saveTripSafe } from '@/app/actions/trips'
import { archivePlace, unarchivePlace } from '@/app/actions/candidates'

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

interface Props {
  initial: PlanResult
  tripId?: string
  initialCandidates?: Candidate[]
  initialArchived?: Candidate[]
}

export function ItineraryClient({ initial, tripId, initialCandidates = [], initialArchived = [] }: Props) {
  const router = useRouter()
  const [plan, setPlan] = useState<PlanResult>(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [targetDays, setTargetDays] = useState<number | null>(null)
  const [recsByDay, setRecsByDay] = useState<RecommendationsByDay | null>(null)
  const recsRef = useRef<RecommendationsByDay | null>(null)
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
  const [candidates] = useState<Candidate[]>(initialCandidates)
  const [archived, setArchived] = useState<Candidate[]>(initialArchived)
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

  useEffect(() => {
    let active = true
    getDayRecommendations(planRef.current.days)
      .then((r) => { if (active) { recsRef.current = r; setRecsByDay(r); setRecsError(null) } })
      .catch(() => { if (active) { recsRef.current = null; setRecsByDay(null); setRecsError('推薦載入失敗，請稍後再試') } })
    return () => { active = false }
  // run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const commitRecs = useCallback((next: RecommendationsByDay | null) => {
    recsRef.current = next
    setRecsByDay(next)
  }, [])

  // 匿名：建立 trip
  const onSave = useCallback(async () => {
    try {
      setSaveError(null)
      const result = await createTripSafe(planRef.current, '未命名行程')
      if (result.ok) {
        router.push(`/itinerary/${result.tripId}`)
      } else if (result.error === 'NOT_AUTHENTICATED') {
        router.push(`/login?next=${encodeURIComponent('/itinerary')}`)
      } else {
        setSaveError(result.error)
        setSaveState('error')
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗，請稍後再試')
      setSaveState('error')
    }
  }, [router])

  // 持久化：plan 變動 → debounced autosave（last-write-wins）
  useEffect(() => {
    if (!tripId) return
    if (plan === savedPlanRef.current) return
    setSaveState('saving')
    setSaveError(null)
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(async () => {
      try {
        const result = await saveTripSafe(tripId, planRef.current)
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
  }, [plan, tripId])

  // 持久化：重試按鈕直接呼叫 saveTrip（ref sentinel 方式無法重新觸發 effect）
  const onRetry = useCallback(async () => {
    if (!tripId) return
    setSaveState('saving')
    setSaveError(null)
    try {
      const result = await saveTripSafe(tripId, planRef.current)
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
  }, [tripId])

  const scheduleRecalc = useCallback((nextPlan: PlanResult, structural = false) => {
    planRef.current = nextPlan
    setPlan(nextPlan)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      let p = planRef.current
      if (structural) {
        try {
          setLegError(null)
          const days = await Promise.all(
            p.days.map(async (d) => ({ ...d, places: legMerge(d.places, await computeLegPlan(d.places)) }))
          )
          p = { ...p, days }
        } catch {
          setLegError('交通時間計算失敗')
        }
      }
      const recalced = recalcPlan(p)
      planRef.current = recalced
      setPlan(recalced)
    }, 2000)
  }, [])

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
      const { travelMin, travelDistanceM } = await legInfo(day.places[idx], next, mode)
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
    }
  }, [])

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
      const newDays = planRef.current.days.map((d, i) => {
        if (i !== dayIdx) return d
        return {
          ...d,
          places: d.places.map((p) =>
            p.id === placeId ? applyTimeEdit(p, field, value) : p
          ),
        }
      })
      scheduleRecalc({ ...planRef.current, days: newDays })
    },
    [scheduleRecalc]
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
    if (!tripId) return
    try {
      const { id } = await archivePlace(tripId, place)
      setArchived((a) => [...a, { id, place, addedBy: 'me', addedByName: '你', source: null }])
      setActionError(null)
    } catch (error) {
      showActionError('加入備用行程失敗，請稍後再試', error)
    }
  }, [tripId, showActionError])

  const handleAddReservePlaces = useCallback((places: Place[]) => {
    places.forEach((place) => { void handleAddReservePlace(place) })
  }, [handleAddReservePlace])

  // TASK-022：封存停車場（per-trip，跨天共用，DEC-503）
  const handleArchivePlace = useCallback(async (dayIdx: number, place: Place) => {
    if (!tripId) return
    try {
      const { id } = await archivePlace(tripId, place)
      const newDays = planRef.current.days.map((d, i) =>
        i === dayIdx ? { ...d, places: d.places.filter((p) => p.id !== place.id) } : d
      )
      scheduleRecalc({ ...planRef.current, days: newDays }, true)
      setArchived((a) => [...a, { id, place, addedBy: 'me', addedByName: '你' }])
      setActionError(null)
    } catch (error) {
      showActionError('加入備用行程失敗，請稍後再試', error)
    }
  }, [tripId, scheduleRecalc, showActionError])

  const handleArchiveRecommendation = useCallback(async (dayIdx: number, rec: DayRecommendation) => {
    const cat = rec.type as 'dessert' | 'attraction' | 'restaurant'
    if (!tripId) return
    try {
      const { id } = await archivePlace(tripId, rec)
      const cur = recsRef.current
      if (cur && cur[dayIdx]) {
        const bucket = cur[dayIdx][cat]
        const next: RecommendationsByDay = cur.map((b, i) =>
          i === dayIdx ? { ...b, [cat]: { ...bucket, shown: bucket.shown.filter((r) => r.placeId !== rec.placeId) } } : b
        )
        commitRecs(next)
      }
      setArchived((a) => [...a, { id, place: rec, addedBy: 'me', addedByName: '你' }])
      setActionError(null)
    } catch (error) {
      showActionError('加入備用行程失敗，請稍後再試', error)
    }
  }, [tripId, commitRecs, showActionError])

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
      setArchived((a) => a.filter((c) => c.id !== candidateId))
      setActionError(null)
    } catch (error) {
      showActionError('加入行程失敗，請稍後再試', error)
    }
  }, [scheduleRecalc, showActionError])

  const handleDeleteArchived = useCallback(async (candidateId: string) => {
    try {
      await unarchivePlace(candidateId)
      setArchived((a) => a.filter((c) => c.id !== candidateId))
      setActionError(null)
    } catch (error) {
      showActionError('刪除備用行程失敗，請稍後再試', error)
    }
  }, [showActionError])

  const buildExcludeIds = useCallback((): string[] => {
    const ids = new Set<string>()
    planRef.current.days.forEach((d) => d.places.forEach((p) => ids.add(p.placeId)))
    const cur = recsRef.current
    if (cur) {
      cur.forEach((b) =>
        (['dessert', 'attraction', 'restaurant'] as const).forEach((c) => {
          b[c].shown.forEach((r) => ids.add(r.placeId))
          b[c].reserve.forEach((r) => ids.add(r.placeId))
        })
      )
    }
    return Array.from(ids)
  }, [])

  // 抽出可重用的「智慧排程單日」核心;智慧排程按鈕與新增推薦後自動排程共用。
  const arrangeDay = useCallback(async (dayIdx: number) => {
    const current = planRef.current
    const day = current.days[dayIdx]
    const inputs = await fetchDayArrangeInputs(
      day.places, current.transportMode, day.avoidCrowds ?? true
    )
    const reordered = arrangeDayOrder(
      day,
      dayDate(current.startDate, day.day),
      inputs,
      { avoidTraffic: day.avoidTraffic ?? true, avoidCrowds: day.avoidCrowds ?? true }
    )
    const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, places: reordered } : d))
    const recalced = recalcPlan({ ...planRef.current, days: newDays })
    planRef.current = recalced
    setPlan(recalced)
    scheduleRecalc(recalced, true)
  }, [scheduleRecalc])

  const handleAddRecommendation = useCallback((dayIdx: number, rec: DayRecommendation) => {
    const cat = rec.type as 'dessert' | 'attraction' | 'restaurant'

    // 1. add the place to the day (existing behavior)
    const newPlace: ScheduledPlace = {
      id: crypto.randomUUID(),
      placeId: rec.placeId,
      name: rec.name,
      type: rec.type,
      lat: rec.lat,
      lng: rec.lng,
      address: rec.address,
      openingHours: rec.openingHours,
      rating: rec.rating,
      photoUrl: rec.photoUrl,
      description: rec.description,
      startTime: '09:00',
      durationMin: DWELL[rec.type],
      travelMinToNext: null,
      aiDescription: rec.reason,
      outsideHours: false,
      lateExit: false,
      startLocked: false,
      durationLocked: false,
    }
    const newDays = planRef.current.days.map((d, i) =>
      i === dayIdx ? { ...d, places: [...d.places, newPlace] } : d
    )
    scheduleRecalc({ ...planRef.current, days: newDays })

    // 1b. 新增後自動智慧排程該天(讓新地點被排到合理位置);失敗則沿用已附加、非重排的結果。
    setArrangingDay(dayIdx)
    arrangeDay(dayIdx).catch(() => {}).finally(() => setArrangingDay(null))

    // 2. remove the card; promote reserve items until the visible list is back to 5 when possible
    const prev = recsRef.current
    if (!prev || !prev[dayIdx]) return
    const bucket = prev[dayIdx][cat]
    const shownAfter = bucket.shown.filter((r) => r.placeId !== rec.placeId)
    const reserve = [...bucket.reserve]
    while (shownAfter.length < 5 && reserve.length > 0) {
      const nextReserve = reserve.shift()
      if (nextReserve) shownAfter.push(nextReserve)
    }
    const missingCount = Math.max(0, 5 - shownAfter.length)
    const updated: RecommendationsByDay = prev.map((b, i) =>
      i === dayIdx ? { ...b, [cat]: { shown: shownAfter, reserve } } : b
    )
    commitRecs(updated)

    // 3. reserve empty → fetch enough Google replacements to return to 5 visible cards
    if (missingCount > 0) {
      const key = `${dayIdx}:${cat}`
      setBackfillKeys((s) => new Set(s).add(key))
      ;(async () => {
        for (let i = 0; i < missingCount; i += 1) {
          const repl = await fetchReplacementRecommendation(planRef.current.days[dayIdx], cat, buildExcludeIds())
          if (!repl) break
          const cur = recsRef.current
          if (!cur || !cur[dayIdx]) break
          if (buildExcludeIds().includes(repl.placeId)) continue
          const b = cur[dayIdx][cat]
          if (b.shown.length >= 5) break
          const next2: RecommendationsByDay = cur.map((x, idx) =>
            idx === dayIdx ? { ...x, [cat]: { shown: [...b.shown, repl], reserve: b.reserve } } : x
          )
          commitRecs(next2)
        }
      })()
        .catch(() => { /* leave slot empty */ })
        .finally(() => setBackfillKeys((s) => { const n = new Set(s); n.delete(key); return n }))
    }
  }, [scheduleRecalc, commitRecs, buildExcludeIds, arrangeDay])

  // TASK-010: manual recommendation center — persists to the day, then refetches that day's 3 categories.
  const setDayRecommendationCenter = useCallback((dayIdx: number, center: RecommendationCenter | null) => {
    const newDays = planRef.current.days.map((d, i) => (i === dayIdx ? { ...d, recommendationCenter: center } : d))
    const newPlan = { ...planRef.current, days: newDays }
    planRef.current = newPlan
    setPlan(newPlan)

    getDayRecommendations([newDays[dayIdx]])
      .then((r) => {
        const cur = recsRef.current
        if (!cur || !cur[dayIdx]) return
        commitRecs(cur.map((b, i) => (i === dayIdx ? r[0] : b)))
      })
      .catch(() => { /* recoverable: keep previous cards on refetch failure */ })
  }, [commitRecs])

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
    const center = resolveDayCenter(planRef.current.days, dayIdx)
    if (!center) return
    const key = `${dayIdx}:${category}`
    setRefreshingKeys((s) => new Set(s).add(key))
    const excludeIds = buildExcludeIds()
    refreshDayCategoryRecommendations({ category, center, excludeIds })
      .then((replacements) => {
        if (replacements.length === 0) return   // recoverable: keep previous cards
        const cur = recsRef.current
        if (!cur || !cur[dayIdx]) return
        commitRecs(cur.map((b, i) =>
          i === dayIdx ? { ...b, [category]: { shown: replacements, reserve: b[category].reserve } } : b
        ))
      })
      .catch(() => { /* recoverable: keep previous cards */ })
      .finally(() => setRefreshingKeys((s) => { const n = new Set(s); n.delete(key); return n }))
  }, [buildExcludeIds, commitRecs])

  const handleChangeStartDate = useCallback((iso: string) => {
    const recalced = recalcPlan({ ...planRef.current, startDate: iso })
    planRef.current = recalced
    setPlan(recalced)
  }, [])

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
    const recalced = recalcPlan({ ...planRef.current, days: newDays })
    planRef.current = recalced
    setPlan(recalced)
  }, [])

  const handleDeletePlace = useCallback((dayIdx: number, placeId: string) => {
    const newDays = planRef.current.days.map((d, i) =>
      i === dayIdx ? { ...d, places: d.places.filter((p) => p.id !== placeId) } : d
    )
    scheduleRecalc({ ...planRef.current, days: newDays }, true)
  }, [scheduleRecalc])

  const handleDeleteDay = useCallback((dayIdx: number) => {
    const next = renumberDays(planRef.current.days.filter((_, i) => i !== dayIdx))
    const recalced = recalcPlan({ ...planRef.current, days: next })
    planRef.current = recalced
    setPlan(recalced)
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
    commitRecs(removeRecsDay(recsRef.current, dayIdx))   // keep recs index-aligned with days
    scheduleRecalc(recalced, true)
  }, [scheduleRecalc, commitRecs])

  const handleScatterDay = useCallback((dayIdx: number) => {
    const src = planRef.current.days[dayIdx]
    const kept = planRef.current.days.filter((_, i) => i !== dayIdx)
    let working = kept
    src.places.forEach((p) => {
      const target = findClosestDay(working, p)
      working = working.map((d, i) => i === target ? { ...d, places: [...d.places, { ...p, travelMinToNext: null }] } : d)
    })
    const next = renumberDays(working)
    const recalced = recalcPlan({ ...planRef.current, days: next })
    planRef.current = recalced
    setPlan(recalced)
    setTargetDays((t) => (t !== null && next.length <= t ? null : t))
    commitRecs(removeRecsDay(recsRef.current, dayIdx))   // keep recs index-aligned with days
    scheduleRecalc(recalced, true)
  }, [scheduleRecalc, commitRecs])

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
    scheduleRecalc(newPlan, true)
  }, [scheduleRecalc])

  const N = targetDays ?? plan.days.length
  const overCount = Math.max(0, plan.days.length - N)

  const allPlaces = plan.days.flatMap((d) => d.places)
  const activePlace = activeId ? allPlaces.find(p => p.id === activeId) ?? null : null
  const activePlaceIndex = activeId ? allPlaces.findIndex(p => p.id === activeId) : -1

  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <div className="flex items-center justify-between mb-6">
        <a href="/" className="text-clay text-sm inline-block">&#x2190; 重新規劃</a>
        {tripId ? (
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
                onArchiveRecommendation={tripId ? (rec) => handleArchiveRecommendation(dayIdx, rec) : undefined}
                candidates={tripId ? candidates : undefined}
                archived={tripId ? archived : undefined}
                onAddReservePlace={tripId ? handleAddReservePlace : undefined}
                onAddReservePlaces={tripId ? handleAddReservePlaces : undefined}
                onAddArchivedToDay={tripId ? (candidateId, place) => handleAddArchivedToDay(candidateId, place, dayIdx) : undefined}
                onDeleteArchived={tripId ? handleDeleteArchived : undefined}
                onArchivePlace={tripId ? (place) => handleArchivePlace(dayIdx, place) : undefined}
                backfilling={{
                  dessert: backfillKeys.has(`${dayIdx}:dessert`),
                  attraction: backfillKeys.has(`${dayIdx}:attraction`),
                  restaurant: backfillKeys.has(`${dayIdx}:restaurant`),
                }}
                recsHasCenter={resolveDayCenter(plan.days, dayIdx) !== null}
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
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </main>
  )
}
