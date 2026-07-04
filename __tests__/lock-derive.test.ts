import { effectivePinned, isTimeAnchored, isDerived } from '@/lib/utils/lockDerive'

const L = (o: Partial<{ startLocked: boolean; durationLocked: boolean; endLocked: boolean }>) => o

it('no locks → nothing pinned', () => {
  expect(effectivePinned(L({}))).toEqual({ start: false, duration: false, end: false })
  expect(isTimeAnchored(L({}))).toBe(false)
})
it('single start lock → only start pinned + time-anchored', () => {
  expect(effectivePinned(L({ startLocked: true }))).toEqual({ start: true, duration: false, end: false })
  expect(isTimeAnchored(L({ startLocked: true }))).toBe(true)
})
it('single end lock → only end pinned + time-anchored', () => {
  expect(effectivePinned(L({ endLocked: true }))).toEqual({ start: false, duration: false, end: true })
  expect(isTimeAnchored(L({ endLocked: true }))).toBe(true)
})
it('single duration lock → duration pinned but NOT time-anchored', () => {
  expect(effectivePinned(L({ durationLocked: true }))).toEqual({ start: false, duration: true, end: false })
  expect(isTimeAnchored(L({ durationLocked: true }))).toBe(false)
})
it('two locks → all three pinned (third derived)', () => {
  expect(effectivePinned(L({ startLocked: true, durationLocked: true }))).toEqual({ start: true, duration: true, end: true })
  expect(isDerived(L({ startLocked: true, durationLocked: true }), 'end')).toBe(true)
  expect(isDerived(L({ startLocked: true, durationLocked: true }), 'start')).toBe(false)
})
it('the un-clicked facet of a two-lock pair is the derived one', () => {
  expect(isDerived(L({ endLocked: true, durationLocked: true }), 'start')).toBe(true)
  expect(isDerived(L({ startLocked: true, endLocked: true }), 'duration')).toBe(true)
})
