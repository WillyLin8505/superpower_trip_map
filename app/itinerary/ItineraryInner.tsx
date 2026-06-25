'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { planItinerary } from '@/app/actions/plan'
import { ItineraryClient } from './ItineraryClient'
import type { Place, TransportMode, PlanResult } from '@/lib/types'

export default function ItineraryInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [plan, setPlan] = useState<PlanResult | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('pendingPlaces')
    if (!raw) { router.replace('/'); return }

    let places: Place[]
    try {
      places = JSON.parse(raw)
    } catch {
      router.replace('/')
      return
    }

    if (places.length < 2) { router.replace('/'); return }

    const days = Number(searchParams.get('days') ?? 2)
    const mode = (searchParams.get('mode') ?? 'driving') as TransportMode

    planItinerary(places, days, mode).then(setPlan)
  }, [router, searchParams])

  if (!plan) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-gray-500">載入中...</p>
      </main>
    )
  }

  return <ItineraryClient initial={plan} />
}
