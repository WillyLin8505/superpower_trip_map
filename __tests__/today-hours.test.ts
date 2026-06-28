import { getHoursForDate, checkLateExit, checkOutsideHours } from '@/lib/utils/hours'

test('returns null for null input', () => {
  expect(getHoursForDate(null, '2026-06-30')).toBeNull()
})

test('returns null for empty array', () => {
  expect(getHoursForDate([], '2026-06-30')).toBeNull()
})

test('extracts hours for Monday (weekdayIndex=0)', () => {
  const hours = [
    'Monday: 9:00 AM – 5:00 PM',
    'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM',
    'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM',
    'Saturday: 10:00 AM – 6:00 PM',
    'Sunday: Closed',
  ]
  // 2026-06-29 is Monday (weekdayIndex=0)
  expect(getHoursForDate(hours, '2026-06-29')).toBe('9:00 AM – 5:00 PM')
})

test('extracts hours for Sunday (weekdayIndex=6)', () => {
  const hours = [
    'Monday: 9:00 AM – 5:00 PM',
    'Tuesday: 9:00 AM – 5:00 PM',
    'Wednesday: 9:00 AM – 5:00 PM',
    'Thursday: 9:00 AM – 5:00 PM',
    'Friday: 9:00 AM – 5:00 PM',
    'Saturday: 10:00 AM – 6:00 PM',
    'Sunday: 11:00 AM – 4:00 PM',
  ]
  // 2026-06-28 is Sunday (weekdayIndex=6)
  expect(getHoursForDate(hours, '2026-06-28')).toBe('11:00 AM – 4:00 PM')
})

test('returns "休息" for Closed entry', () => {
  const hours = Array(7).fill('Monday: Closed')
  // 2026-06-29 is Monday (weekdayIndex=0)
  expect(getHoursForDate(hours, '2026-06-29')).toBe('休息')
})

test('handles Chinese format with full-width colon', () => {
  // Google returns zh-TW format: "星期一：09:00–17:00"
  const hours = Array(7).fill('星期一：09:00–17:00')
  expect(getHoursForDate(hours, '2026-06-30')).toBe('09:00–17:00')
})

describe('checkLateExit', () => {
  test('returns false for null openingHours', () => {
    expect(checkLateExit('09:00', 90, null, '2026-06-30')).toBe(false)
  })

  test('returns false for empty array', () => {
    expect(checkLateExit('09:00', 90, [], '2026-06-30')).toBe(false)
  })

  test('returns false when end time is before closing', () => {
    // start 09:00 + 90min = 10:30, close 17:00 → not late
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    expect(checkLateExit('09:00', 90, hours, '2026-06-30')).toBe(false)
  })

  test('returns false when end time equals closing exactly', () => {
    // start 15:30 + 90min = 17:00, close 17:00 → not late (exactly at close)
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    expect(checkLateExit('15:30', 90, hours, '2026-06-30')).toBe(false)
  })

  test('returns true when end time exceeds closing by 1 minute', () => {
    // start 15:31 + 90min = 17:01, close 17:00 → late
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    expect(checkLateExit('15:31', 90, hours, '2026-06-30')).toBe(true)
  })

  test('returns true when entire visit is after closing', () => {
    // start 18:00 + 60min = 19:00, close 17:00 → late
    const hours = Array(7).fill('Monday: 9:00 AM – 5:00 PM')
    expect(checkLateExit('18:00', 60, hours, '2026-06-30')).toBe(true)
  })

  test('handles Chinese 24h format (星期一：09:00–17:00)', () => {
    // start 15:31 + 90min = 17:01, close 17:00 → late
    const hours = Array(7).fill('星期一：09:00–17:00')
    expect(checkLateExit('15:31', 90, hours, '2026-06-30')).toBe(true)
  })

  test('returns false for Closed entry', () => {
    const hours = Array(7).fill('Monday: Closed')
    expect(checkLateExit('09:00', 90, hours, '2026-06-30')).toBe(false)
  })
})

describe('checkOutsideHours', () => {
  test('returns false for null openingHours', () => {
    expect(checkOutsideHours('09:00', null, '2026-06-30')).toBe(false)
  })

  test('returns false for empty array', () => {
    expect(checkOutsideHours('09:00', [], '2026-06-30')).toBe(false)
  })

  test('returns false when start is within hours', () => {
    // open 09:00 AM – 05:00 PM; start 10:00 → within
    const hours = [
      'Monday: 9:00 AM – 5:00 PM',
      'Tuesday: 9:00 AM – 5:00 PM',
      'Wednesday: 9:00 AM – 5:00 PM',
      'Thursday: 9:00 AM – 5:00 PM',
      'Friday: 9:00 AM – 5:00 PM',
      'Saturday: 9:00 AM – 5:00 PM',
      'Sunday: 9:00 AM – 5:00 PM',
    ]
    // 2026-06-30 is Tuesday (weekdayIndex=1)
    expect(checkOutsideHours('10:00', hours, '2026-06-30')).toBe(false)
  })

  test('returns true when start is before open', () => {
    // open 09:00 AM; start 08:00 → before open
    const hours = [
      'Monday: 9:00 AM – 5:00 PM',
      'Tuesday: 9:00 AM – 5:00 PM',
      'Wednesday: 9:00 AM – 5:00 PM',
      'Thursday: 9:00 AM – 5:00 PM',
      'Friday: 9:00 AM – 5:00 PM',
      'Saturday: 9:00 AM – 5:00 PM',
      'Sunday: 9:00 AM – 5:00 PM',
    ]
    expect(checkOutsideHours('08:00', hours, '2026-06-30')).toBe(true)
  })

  test('returns true when start is exactly at close', () => {
    // close 05:00 PM = 17:00; start 17:00 → at or past close
    const hours = [
      'Monday: 9:00 AM – 5:00 PM',
      'Tuesday: 9:00 AM – 5:00 PM',
      'Wednesday: 9:00 AM – 5:00 PM',
      'Thursday: 9:00 AM – 5:00 PM',
      'Friday: 9:00 AM – 5:00 PM',
      'Saturday: 9:00 AM – 5:00 PM',
      'Sunday: 9:00 AM – 5:00 PM',
    ]
    expect(checkOutsideHours('17:00', hours, '2026-06-30')).toBe(true)
  })

  test('returns false when hours are in 24h format (within hours)', () => {
    // 24h format is now handled correctly; 10:00 is within 09:00–17:00
    const hours = Array(7).fill('Monday: 09:00–17:00')
    expect(checkOutsideHours('10:00', hours, '2026-06-30')).toBe(false)
  })
})
