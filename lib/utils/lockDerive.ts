type LockLike = { startLocked?: boolean; durationLocked?: boolean; endLocked?: boolean }
export type Facet = 'start' | 'duration' | 'end'
export interface PinnedFacets { start: boolean; duration: boolean; end: boolean }

// 兩鎖 → 第三個自動固定(數學上 end = start + duration)
export function effectivePinned(p: LockLike): PinnedFacets {
  const s = !!p.startLocked, d = !!p.durationLocked, e = !!p.endLocked
  const count = (s ? 1 : 0) + (d ? 1 : 0) + (e ? 1 : 0)
  if (count >= 2) return { start: true, duration: true, end: true }
  return { start: s, duration: d, end: e }
}

// 開始或結束被釘 = 有固定時間位置(排程錨點)
export function isTimeAnchored(p: LockLike): boolean {
  const e = effectivePinned(p)
  return e.start || e.end
}

// 該 facet 被有效釘住,但使用者沒直接點它的鎖(= 衍生鎖)
export function isDerived(p: LockLike, facet: Facet): boolean {
  const userLocked = facet === 'start' ? !!p.startLocked : facet === 'duration' ? !!p.durationLocked : !!p.endLocked
  return effectivePinned(p)[facet] && !userLocked
}
