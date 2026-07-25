import type { PlanResult, ScheduledPlace } from '@/lib/types'
import type { Change } from '@/lib/utils/rearrangeChanges'
import { haversineMeters } from '@/lib/haversine'

type RemoveChange = Extract<Change, { kind: 'remove' }>

// Two pins with the same name but different place IDs only count as the same
// place when they sit at essentially the same spot — otherwise two branches of a
// chain (e.g. two Starbucks) would look like duplicates. Literal repeats share a
// place ID and are caught regardless of distance.
const SAME_SPOT_METERS = 120

const DUP_WORDS_ZH = /重複|重覆|重复/
const REMOVE_WORDS_ZH = /刪|删|移除|去除|清除|清掉|拿掉|去掉|剔除/

function normalizeName(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * True when a typed rearrange instruction is asking to remove duplicate places,
 * e.g. 「刪掉重複的」/「把重複的地點移除」/「remove duplicates」/「dedupe」.
 * Deterministic on purpose — dedup never goes through the LLM.
 */
export function isRemoveDuplicatesInstruction(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const lower = t.toLowerCase()
  if (/\bde-?dup(?:e|licat\w*)?\b/.test(lower)) return true
  if (/duplicat\w*/.test(lower) && /\b(?:remove|delete|drop|clear|clean)\b/.test(lower)) return true
  if (/去重/.test(t)) return true
  return DUP_WORDS_ZH.test(t) && REMOVE_WORDS_ZH.test(t)
}

interface FlatPlace {
  place: ScheduledPlace
  day: number
  order: number
}

function isSamePlace(a: FlatPlace, b: FlatPlace): boolean {
  const aId = a.place.placeId?.trim()
  const bId = b.place.placeId?.trim()
  if (aId && bId && aId === bId) return true
  const aName = normalizeName(a.place.name)
  const bName = normalizeName(b.place.name)
  return Boolean(aName) && aName === bName && haversineMeters(a.place, b.place) <= SAME_SPOT_METERS
}

function isLocked(p: ScheduledPlace): boolean {
  return Boolean(p.startLocked || p.durationLocked || p.endLocked)
}

/**
 * Finds places that appear more than once across the whole trip and proposes a
 * `remove` change for every copy except the keeper (a locked/pinned copy if the
 * group has one, otherwise the earliest occurrence). Pure and LLM-free.
 */
export function findDuplicateRemovals(plan: PlanResult): Change[] {
  const flat: FlatPlace[] = []
  let order = 0
  for (const day of plan.days) {
    for (const place of day.places) {
      flat.push({ place, day: day.day, order: order++ })
    }
  }

  // Union-find so that A~B and B~C collapse into one group even if A and C were
  // matched by different rules (id vs name+proximity).
  const parent = flat.map((_, i) => i)
  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root]
    while (parent[i] !== root) {
      const next = parent[i]
      parent[i] = root
      i = next
    }
    return root
  }
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      if (isSamePlace(flat[i], flat[j])) parent[find(i)] = find(j)
    }
  }

  const groups = new Map<number, FlatPlace[]>()
  for (let i = 0; i < flat.length; i++) {
    const root = find(i)
    const group = groups.get(root)
    if (group) group.push(flat[i])
    else groups.set(root, [flat[i]])
  }

  const changes: RemoveChange[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [keeper, ...removed] = [...group].sort((a, b) => {
      const lockRank = (isLocked(a.place) ? 0 : 1) - (isLocked(b.place) ? 0 : 1)
      return lockRank !== 0 ? lockRank : a.order - b.order
    })
    for (const item of removed) {
      changes.push({
        id: `remove-${item.place.id}`,
        day: item.day,
        kind: 'remove',
        placeId: item.place.placeId,
        placeName: item.place.name,
        instanceId: item.place.id,
        keptDay: keeper.day,
      })
    }
  }

  const orderOf = new Map(flat.map((f) => [f.place.id, f.order]))
  return changes.sort((a, b) => (orderOf.get(a.instanceId) ?? 0) - (orderOf.get(b.instanceId) ?? 0))
}
