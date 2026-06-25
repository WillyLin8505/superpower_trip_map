import { Suspense } from 'react'
import ItineraryInner from './ItineraryInner'

function LoadingState() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-10">
      <p className="text-gray-500">載入中...</p>
    </main>
  )
}

export default function ItineraryPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ItineraryInner />
    </Suspense>
  )
}
