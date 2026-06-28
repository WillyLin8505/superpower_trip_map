import { getHoursForDate, checkOutsideHours, checkLateExit } from '@/lib/utils/hours'

// openingHours: Monday-first 7 筆。週一公休、其餘 9:00 AM – 5:00 PM。
const HOURS = [
  'Monday: Closed',
  'Tuesday: 9:00 AM – 5:00 PM',
  'Wednesday: 9:00 AM – 5:00 PM',
  'Thursday: 9:00 AM – 5:00 PM',
  'Friday: 9:00 AM – 5:00 PM',
  'Saturday: 9:00 AM – 5:00 PM',
  'Sunday: 9:00 AM – 5:00 PM',
]

it('getHoursForDate picks the row for that date\'s weekday', () => {
  expect(getHoursForDate(HOURS, '2026-06-30')).toBe('9:00 AM – 5:00 PM') // Tue
  expect(getHoursForDate(HOURS, '2026-06-29')).toBe('休息')               // Mon (Closed)
})

it('checkOutsideHours uses the given date, not today', () => {
  // 14:00 on Tuesday (open) → inside
  expect(checkOutsideHours('14:00', HOURS, '2026-06-30')).toBe(false)
  // 14:00 on Monday (closed) → outside
  expect(checkOutsideHours('14:00', HOURS, '2026-06-29')).toBe(true)
})

it('checkLateExit uses the given date close time', () => {
  // Tue close 17:00; start 16:00 + 90min = 17:30 → late
  expect(checkLateExit('16:00', 90, HOURS, '2026-06-30')).toBe(true)
  expect(checkLateExit('14:00', 60, HOURS, '2026-06-30')).toBe(false)
})
