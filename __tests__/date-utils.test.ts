import { addDays, dayDate, weekdayIndex, formatDateLabel, daysBetween } from '@/lib/utils/date'

describe('date utils', () => {
  it('addDays handles month/year crossover', () => {
    expect(addDays('2026-06-29', 3)).toBe('2026-07-02')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-06-10', 0)).toBe('2026-06-10')
  })
  it('dayDate is 1-indexed from startDate', () => {
    expect(dayDate('2026-06-28', 1)).toBe('2026-06-28')
    expect(dayDate('2026-06-28', 3)).toBe('2026-06-30')
  })
  it('weekdayIndex is Monday-first (0=Mon..6=Sun)', () => {
    expect(weekdayIndex('2026-06-29')).toBe(0) // Monday
    expect(weekdayIndex('2026-06-28')).toBe(6) // Sunday
  })
  it('formatDateLabel shows M/D（週）', () => {
    expect(formatDateLabel('2026-06-29')).toBe('6/29（一）')
    expect(formatDateLabel('2026-06-28')).toBe('6/28（日）')
  })
  it('daysBetween is inclusive of both ends', () => {
    expect(daysBetween('2026-06-28', '2026-06-28')).toBe(1)
    expect(daysBetween('2026-06-28', '2026-06-30')).toBe(3)
  })
  it('daysBetween is exact across a DST boundary (UTC counting)', () => {
    // US spring-forward 2026-03-08; 03-07 → 03-09 must be 3 inclusive days
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(3)
  })
})
