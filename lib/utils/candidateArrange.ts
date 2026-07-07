import { findClosestDay } from './geo'
import type { Candidate, DayItinerary } from '@/lib/types'

// 依地理把候選池分到各天：有錨的天用 findClosestDay 就近吸附（空天回 Infinity 不會被選）；
// 若所有天皆空（無錨可比，findClosestDay 會全回 0），改用 round-robin 依索引分散，避免全擠第 0 天。
export function groupCandidatesByDay(days: DayItinerary[], candidates: Candidate[]): Candidate[][] {
  const buckets: Candidate[][] = days.map(() => [])
  if (days.length === 0) return buckets
  const hasAnchor = days.some((d) => d.places.length > 0)
  candidates.forEach((c, i) => {
    const idx = hasAnchor ? findClosestDay(days, c.place) : i % days.length
    buckets[idx].push(c)
  })
  return buckets
}
