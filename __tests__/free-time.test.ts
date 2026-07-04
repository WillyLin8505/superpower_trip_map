import { freeBlocks, formatGap } from '@/lib/utils/freeTime'
import type { ScheduledPlace } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}

it('formatGap: minutes < 60 → "N 分"', () => {
  expect(formatGap(40)).toBe('40 分')
  expect(formatGap(5)).toBe('5 分')
})
it('formatGap: whole hours → "N 小時"', () => {
  expect(formatGap(60)).toBe('1 小時')
  expect(formatGap(300)).toBe('5 小時')
})
it('formatGap: hours + minutes → "N 小時 M 分"', () => {
  expect(formatGap(80)).toBe('1 小時 20 分')
})

it('freeBlocks: card-gap >= 15 produces a block after that card', () => {
  // A 09:00 (60min) + 10 travel → ends+travel 10:10; B locked 11:00 → gap 50
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 })
  const B = sp('B', { startTime: '11:00', durationMin: 60, startLocked: true })
  // dayEnd = 12:00 so B end (12:00) leaves 0 remaining → no end block, isolating the card-gap
  expect(freeBlocks([A, B], 12 * 60)).toEqual([{ afterId: 'A', minutes: 50 }])
})
it('freeBlocks: card-gap < 15 produces no block', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 }) // ends+travel 10:10
  const B = sp('B', { startTime: '10:20', durationMin: 60 })                       // gap 10 < 15
  // B ends 11:20; dayEnd 11:30 → remaining 10 < 15 → no end block
  expect(freeBlocks([A, B], 11 * 60 + 30)).toEqual([])
})
it('freeBlocks: negative gap (overlap/overflow) produces no block', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 30 }) // ends+travel 10:30
  const B = sp('B', { startTime: '10:00', durationMin: 60 })                       // gap -30
  expect(freeBlocks([A, B], 11 * 60)).toEqual([])  // B ends 11:00, dayEnd 11:00 → 0 remaining
})
it('freeBlocks: day-end remaining >= 15 produces a block with untilTime', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60 }) // ends 10:00
  // single card; dayEnd 21:00 → remaining 660
  expect(freeBlocks([A], 21 * 60)).toEqual([{ afterId: 'A', minutes: 660, untilTime: '21:00' }])
})
it('freeBlocks: empty day → []', () => {
  expect(freeBlocks([], 21 * 60)).toEqual([])
})
