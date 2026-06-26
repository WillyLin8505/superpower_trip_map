// __tests__/time-utils.test.ts
import { addMinutes, minsToTime } from '@/lib/utils/time'

test('minsToTime converts 540 to 09:00', () => {
  expect(minsToTime(540)).toBe('09:00')
})

test('minsToTime converts 0 to 00:00', () => {
  expect(minsToTime(0)).toBe('00:00')
})

test('minsToTime clamps negative to 00:00', () => {
  expect(minsToTime(-30)).toBe('00:00')
})

test('minsToTime converts 1439 to 23:59', () => {
  expect(minsToTime(1439)).toBe('23:59')
})

test('addMinutes adds 90 minutes to 09:00 giving 10:30', () => {
  expect(addMinutes('09:00', 90)).toBe('10:30')
})

test('addMinutes wraps past midnight', () => {
  expect(addMinutes('23:00', 90)).toBe('00:30')
})

test('addMinutes with 0 minutes returns same time', () => {
  expect(addMinutes('14:30', 0)).toBe('14:30')
})
