// __tests__/crowd-cache.test.ts
import { InMemoryCrowdCache } from '@/lib/crowd/cache'
import type { CrowdForecast } from '@/lib/crowd/types'

const sample: CrowdForecast = {
  source: 'heuristic',
  weekly: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 10)),
  fetchedAt: '2026-06-28T00:00:00.000Z',
}

test('returns undefined for missing key', () => {
  const c = new InMemoryCrowdCache()
  expect(c.get('x')).toBeUndefined()
})
test('returns stored value before TTL', () => {
  let t = 1000
  const c = new InMemoryCrowdCache(() => t)
  c.set('x', sample, 5000)
  t = 2000
  expect(c.get('x')).toEqual(sample)
})
test('expires after TTL', () => {
  let t = 1000
  const c = new InMemoryCrowdCache(() => t)
  c.set('x', sample, 5000)
  t = 6001
  expect(c.get('x')).toBeUndefined()
})
