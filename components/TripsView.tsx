'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { TripSummary } from '@/lib/types'
import { renameTrip, deleteTrip } from '@/app/actions/trips'

export function TripsView({ trips }: { trips: TripSummary[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  if (trips.length === 0) {
    return <p className="text-gray-500 px-4 py-10">還沒有儲存的行程,從首頁建立一個吧</p>
  }

  async function onRename(id: string, current: string) {
    const next = window.prompt('新名稱', current)
    if (!next || next === current) return
    setBusy(id)
    try { await renameTrip(id, next); router.refresh() } finally { setBusy(null) }
  }
  async function onDelete(id: string) {
    if (!window.confirm('確定刪除這個行程?')) return
    setBusy(id)
    try { await deleteTrip(id); router.refresh() } finally { setBusy(null) }
  }

  return (
    <ul className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-2">
      {trips.map((t) => (
        <li key={t.id} className="border rounded-md px-4 py-3 flex items-center justify-between">
          <Link href={`/itinerary/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-400">{t.updatedAt.slice(0, 10)}</span>
            <button onClick={() => onRename(t.id, t.title)} disabled={busy === t.id} className="hover:underline">改名</button>
            <button onClick={() => onDelete(t.id)} disabled={busy === t.id} className="text-red-600 hover:underline">刪除</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
