// __tests__/timeline.test.ts
import { timelineLayout, pxToDuration, rulerTicks, PX_PER_MIN, MIN_CARD_PX, MIN_DURATION_MIN } from '@/lib/utils/timeline'
import type { ScheduledPlace } from '@/lib/types'

function p(over: Partial<ScheduledPlace>): ScheduledPlace {
  return {
    id: 'x', placeId: 'pid', name: 'X', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

test('empty day → zeroed layout', () => {
  expect(timelineLayout([])).toEqual({ dayStartMin: 0, dayEndMin: 0, totalPx: 0, cards: [] })
})

test('two places: heights, gap, range, totalPx', () => {
  const places = [
    p({ id: 'a', startTime: '09:00', durationMin: 60, travelMinToNext: 20 }),
    p({ id: 'b', startTime: '10:20', durationMin: 90, travelMinToNext: null }),
  ]
  const l = timelineLayout(places)
  expect(l.dayStartMin).toBe(540)            // 09:00
  expect(l.dayEndMin).toBe(620 + 90)         // 10:20 + 90 = 11:50 = 710
  expect(l.cards[0].heightPx).toBe(60 * PX_PER_MIN)
  expect(l.cards[0].travelMin).toBe(20)
  expect(l.cards[0].travelGapPx).toBe(20 * PX_PER_MIN)
  expect(l.cards[1].travelMin).toBe(0)       // last card: no gap
  expect(l.cards[1].travelGapPx).toBe(0)
  expect(l.totalPx).toBeCloseTo(60 * PX_PER_MIN + 20 * PX_PER_MIN + 90 * PX_PER_MIN)
})

test('very short stay floored to MIN_CARD_PX', () => {
  const l = timelineLayout([p({ durationMin: 10 })]) // 10*1.2=12 < 36
  expect(l.cards[0].heightPx).toBe(MIN_CARD_PX)
})

test('pxToDuration snaps to 5 and respects floor', () => {
  expect(pxToDuration(60, 12)).toBe(70)        // +12px /1.2 = +10min → 70
  expect(pxToDuration(60, 5)).toBe(65)         // +5/1.2≈4.17 → snap 5 → 65
  expect(pxToDuration(60, -1000)).toBe(MIN_DURATION_MIN) // floor
})

test('rulerTicks hourly within range', () => {
  const ticks = rulerTicks(540, 710) // 09:00–11:50
  expect(ticks.map((t) => t.label)).toEqual(['10:00', '11:00'])
  expect(ticks[0].topPx).toBe((600 - 540) * PX_PER_MIN)
})
