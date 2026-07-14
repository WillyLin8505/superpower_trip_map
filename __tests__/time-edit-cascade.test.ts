import { applyTimeEditCascade } from '@/lib/utils/timeEdit'
import type { ScheduledPlace } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 0, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

const DATE = '2026-07-14'
const DAY_START_MIN = 9 * 60 // 09:00

// A 09:00–10:00 -> B 10:00–11:00 -> C 11:00–12:00 (travel 0 throughout)
function abc() {
  return [
    sp('A', { durationMin: 60, travelMinToNext: 0 }),
    sp('B', { startTime: '10:00', durationMin: 60, travelMinToNext: 0 }),
    sp('C', { startTime: '11:00', durationMin: 60, travelMinToNext: 0 }),
  ]
}

it('1. moving B\'s start later: B shifts, A\'s end aligns (duration extends), C follows forward', () => {
  const out = applyTimeEditCascade(abc(), 'B', 'startTime', '10:30', DATE, DAY_START_MIN)
  expect(out[1].startTime).toBe('10:30')
  expect(out[1].durationMin).toBe(60) // B itself: start+duration preserved, only end derived
  expect(out[0].startTime).toBe('09:00') // A keeps its own start
  expect(out[0].durationMin).toBe(90)    // A's duration extends to align its end with B's new start
  expect(out[2].startTime).toBe('11:30') // C follows forward from B's new end
})

it('2. moving B\'s start earlier (symmetric): A\'s duration shrinks, C follows backward', () => {
  const out = applyTimeEditCascade(abc(), 'B', 'startTime', '09:30', DATE, DAY_START_MIN)
  expect(out[1].startTime).toBe('09:30')
  expect(out[0].startTime).toBe('09:00')
  expect(out[0].durationMin).toBe(30) // A shrinks: 09:00-09:30
  expect(out[2].startTime).toBe('10:30') // C follows: B ends 09:30+60=10:30
})

it('3. travel time is preserved when aligning the previous card\'s end', () => {
  const places = [
    sp('A', { durationMin: 60, travelMinToNext: 15 }),
    sp('B', { startTime: '10:15', durationMin: 60, travelMinToNext: 0 }),
  ]
  const out = applyTimeEditCascade(places, 'B', 'startTime', '10:45', DATE, DAY_START_MIN)
  // prev.end + travel = next.start  =>  A's end = 10:45 - 15 = 10:30 => duration = 90
  expect(out[0].durationMin).toBe(90)
  expect(out[1].startTime).toBe('10:45')
})

it('4. inversion clamp: when alignment would make the previous card\'s duration negative, clamp to 0 (end = its own start)', () => {
  const places = [
    sp('A', { startTime: '10:45', durationMin: 60, travelMinToNext: 0 }),
    sp('B', { startTime: '12:00', durationMin: 60, travelMinToNext: 0 }),
  ]
  // Move B's start to 10:30 — earlier than A's own start (10:45) — impossible to align without going negative.
  const out = applyTimeEditCascade(places, 'B', 'startTime', '10:30', DATE, DAY_START_MIN)
  expect(out[0].startTime).toBe('10:45') // A's own start is never moved
  expect(out[0].durationMin).toBe(0)     // clamped: end === start
})

it('5a. editing the first card: no previous neighbor to align, only forward cascade', () => {
  const out = applyTimeEditCascade(abc(), 'A', 'startTime', '08:00', DATE, DAY_START_MIN)
  expect(out[0].startTime).toBe('08:00')
  expect(out[1].startTime).toBe('09:00') // B follows A's new end (08:00+60)
  expect(out[2].startTime).toBe('10:00')
})

it('5b. editing the last card: only the previous neighbor aligns, no forward cascade needed', () => {
  const out = applyTimeEditCascade(abc(), 'C', 'startTime', '11:30', DATE, DAY_START_MIN)
  expect(out[2].startTime).toBe('11:30')
  expect(out[1].durationMin).toBe(90) // B's end aligns to C's new start: 10:00-11:30
  expect(out[0].startTime).toBe('09:00') // untouched — B's start didn't move
})

it('6a. a hard-locked previous neighbor is never overwritten', () => {
  const places = [
    sp('A', { startTime: '09:00', durationMin: 60, startLocked: true, travelMinToNext: 0 }),
    sp('B', { startTime: '10:00', durationMin: 60, travelMinToNext: 0 }),
  ]
  const out = applyTimeEditCascade(places, 'B', 'startTime', '10:30', DATE, DAY_START_MIN)
  expect(out[0]).toEqual(places[0]) // A completely untouched (still locked, same values)
  expect(out[1].startTime).toBe('10:30')
})

it('6b. forward cascade stops at a hard-locked card further along and resumes after it', () => {
  const places = [
    sp('A', { durationMin: 60, travelMinToNext: 0 }),      // edited
    sp('B', { startTime: '10:00', durationMin: 60, travelMinToNext: 0 }), // unlocked, between
    sp('D', { startTime: '13:00', durationMin: 60, startLocked: true, travelMinToNext: 0 }), // hard lock
    sp('E', { durationMin: 30, travelMinToNext: 0 }),      // after the lock
  ]
  const out = applyTimeEditCascade(places, 'A', 'startTime', '08:00', DATE, DAY_START_MIN)
  expect(out[0].startTime).toBe('08:00')
  expect(out[1].startTime).toBe('09:00') // B follows A forward
  expect(out[2]).toEqual(places[2])      // D (locked) is untouched
  expect(out[3].startTime).toBe('14:00') // E resumes forward-fill from D's end
})

it('7. regression: editing durationMin (not startTime) still cascades correctly', () => {
  const out = applyTimeEditCascade(abc(), 'B', 'durationMin', 90, DATE, DAY_START_MIN)
  expect(out[1].startTime).toBe('10:00') // B's own start untouched
  expect(out[1].durationMin).toBe(90)
  expect(out[0].startTime).toBe('09:00') // A unaffected — B's start didn't move, only its duration
  expect(out[0].durationMin).toBe(60)
  expect(out[2].startTime).toBe('11:30') // C follows B's new (later) end
})

it('returns the original array unchanged when placeId is not found', () => {
  const places = abc()
  const out = applyTimeEditCascade(places, 'does-not-exist', 'startTime', '10:30', DATE, DAY_START_MIN)
  expect(out).toBe(places)
})
