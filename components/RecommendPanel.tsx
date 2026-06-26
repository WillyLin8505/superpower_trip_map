'use client'
import { useState, useEffect } from 'react'
import type { Recommendation, ScheduledPlace } from '@/lib/types'
import { RecommendCard } from './RecommendCard'
import { getRecommendations } from '@/app/actions/recommend'

interface Props {
  currentPlaces: ScheduledPlace[]
  onAddPlaces: (places: ScheduledPlace[]) => void
}

export function RecommendPanel({ currentPlaces, onAddPlaces }: Props) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const result = await getRecommendations(currentPlaces)
      setRecs(result)
    } catch {
      setRecs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })

  const handleAdd = () => {
    if (!recs) return
    const toAdd: ScheduledPlace[] = recs
      .filter((r) => selected.has(r.name) && r.verified && r.placeId && r.lat !== null && r.lng !== null)
      .map((r) => ({
        id: crypto.randomUUID(),
        placeId: r.placeId as string,
        name: r.name,
        type: r.type,
        lat: r.lat as number,
        lng: r.lng as number,
        address: '',
        openingHours: null,
        rating: null,
        photoUrl: null,
        description: null,
        startTime: '09:00',
        durationMin: r.type === 'attraction' ? 90 : 60,
        travelMinToNext: null,
        aiDescription: r.reason,
        outsideHours: false,
        lateExit: false,
        timeLocked: false,
      }))
    onAddPlaces(toAdd)
    setSelected(new Set())
  }

  return (
    <section className="mt-12 border-t border-gray-200 pt-8">
      <h2 className="text-xl font-bold text-gray-800 mb-2">推薦地點</h2>
      <p className="text-sm text-gray-500 mb-4">根據參考網站自動分析，找出適合加入你行程的地點</p>

      {loading && (
        <p className="text-gray-400 text-sm">分析中...</p>
      )}

      {!loading && recs !== null && (
        <button
          onClick={load}
          className="text-sm text-gray-500 underline mb-4"
        >
          重新整理推薦
        </button>
      )}

      {!loading && recs !== null && recs.length === 0 && (
        <p className="text-gray-400 text-sm">目前沒有推薦（請先在後台設定參考網站）</p>
      )}

      {!loading && recs !== null && recs.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            {recs.map((r, i) => (
              <RecommendCard
                key={`${r.sourceLabel}-${i}`}
                rec={r}
                selected={selected.has(r.name)}
                onToggle={() => toggle(r.name)}
              />
            ))}
          </div>
          {selected.size > 0 && (
            <button
              onClick={handleAdd}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700"
            >
              加入 {selected.size} 個地點並重新排序
            </button>
          )}
        </>
      )}
    </section>
  )
}
