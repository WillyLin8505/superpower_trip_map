// __tests__/crowd-types.test.ts
import { levelAt, type CrowdForecast } from '@/lib/crowd/types'

function fc(value: number | null): CrowdForecast {
  const weekly = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => value))
  return { source: 'heuristic', weekly, fetchedAt: '2026-06-28T00:00:00.000Z' }
}

test('null cell → null', () => {
  expect(levelAt(fc(null), 0, 9)).toBeNull()
})
test('< 40 → low', () => {
  expect(levelAt(fc(20), 0, 9)).toBe('low')
})
test('40–69 → medium', () => {
  expect(levelAt(fc(55), 0, 9)).toBe('medium')
})
test('>= 70 → high', () => {
  expect(levelAt(fc(85), 0, 9)).toBe('high')
})
test('out-of-range indices → null', () => {
  expect(levelAt(fc(50), 9, 99)).toBeNull()
})
test('exactly 40 → medium (boundary)', () => {
  expect(levelAt(fc(40), 0, 9)).toBe('medium')
})
test('exactly 70 → high (boundary)', () => {
  expect(levelAt(fc(70), 0, 9)).toBe('high')
})
