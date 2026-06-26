import { getTodayHours } from '@/lib/utils/hours'

test('returns null for null input', () => {
  expect(getTodayHours(null)).toBeNull()
})

test('returns null for empty array', () => {
  expect(getTodayHours([])).toBeNull()
})

test('extracts hours for Monday (getDay=1 → index 0)', () => {
  const hours = [
    'Monday: 9:00 AM – 5:00 PM',
    'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM',
    'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM',
    'Saturday: 10:00 AM – 6:00 PM',
    'Sunday: Closed',
  ]
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
  expect(getTodayHours(hours)).toBe('9:00 AM – 5:00 PM')
  spy.mockRestore()
})

test('extracts hours for Sunday (getDay=0 → index 6)', () => {
  const hours = [
    'Monday: 9:00 AM – 5:00 PM',
    'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM',
    'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM',
    'Saturday: 10:00 AM – 6:00 PM',
    'Sunday: 11:00 AM – 4:00 PM',
  ]
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(0)
  expect(getTodayHours(hours)).toBe('11:00 AM – 4:00 PM')
  spy.mockRestore()
})

test('returns "休息" for Closed entry', () => {
  const hours = Array(7).fill('Monday: Closed')
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
  expect(getTodayHours(hours)).toBe('休息')
  spy.mockRestore()
})

test('handles Chinese format with full-width colon', () => {
  // Google returns zh-TW format: "星期一：09:00–17:00"
  const hours = Array(7).fill('星期一：09:00–17:00')
  const spy = jest.spyOn(Date.prototype, 'getDay').mockReturnValue(1)
  expect(getTodayHours(hours)).toBe('09:00–17:00')
  spy.mockRestore()
})
