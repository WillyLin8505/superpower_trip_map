'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { planItinerary } from '@/app/actions/plan'
import { ItineraryClient } from './ItineraryClient'
import type { Place, TransportMode, PlanResult } from '@/lib/types'
import {
  buildItineraryDraftCacheKey,
  readItineraryDraft,
  writeItineraryDraft,
} from '@/lib/itineraryDraftCache'

function hasHanText(value: string | null | undefined): boolean {
  return /[\u3400-\u9fff]/.test(value ?? '')
}

function planHasMissingChineseNames(plan: PlanResult): boolean {
  return plan.days.some((day) =>
    day.places.some((place) =>
      !hasHanText(place.localizedName?.zhTw) && !hasHanText(place.name)
    )
  )
}

export default function ItineraryInner() {
  const router = useRouter()
  const { replace } = router
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()
  const [plan, setPlan] = useState<PlanResult | null>(null)
  const [loadedFromCache, setLoadedFromCache] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(searchKey)
    const raw = sessionStorage.getItem('pendingPlaces')
    if (!raw) { replace('/'); return }

    let places: Place[]
    try {
      places = JSON.parse(raw)
    } catch {
      replace('/')
      return
    }

    if (places.length < 2) { replace('/'); return }

    const days = Number(params.get('days') ?? 2)
    const mode = (params.get('mode') ?? 'driving') as TransportMode
    const now = new Date()
    const isoToday = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const start = params.get('start') ?? isoToday

    const cacheKey = buildItineraryDraftCacheKey(places, days, mode, start)
    const forceRefresh = params.get('refresh') === '1'
    const cachedPlan = forceRefresh ? null : readItineraryDraft(localStorage, cacheKey)

    if (cachedPlan && !planHasMissingChineseNames(cachedPlan)) {
      setLoadedFromCache(true)
      setPlan(cachedPlan)
      return
    }

    setLoadedFromCache(false)
    planItinerary(places, days, mode, start).then((nextPlan) => {
      writeItineraryDraft(localStorage, cacheKey, nextPlan)
      setPlan(nextPlan)
    })
  }, [replace, searchKey])

  if (!plan) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-gray-500">載入中...</p>
      </main>
    )
  }

  return (
    <>
      {loadedFromCache && (
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            已載入上次規劃結果，未重新呼叫規劃服務。
          </p>
        </div>
      )}
      <ItineraryClient initial={plan} />
    </>
  )
}
