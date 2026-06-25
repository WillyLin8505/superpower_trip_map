import { optimizeRoute } from '@/app/actions/optimize'
import type { DistanceMatrix } from '@/lib/types'

// A 4-city problem with known optimal order: 0→1→2→3
const matrix: DistanceMatrix = {
  indices: ['a', 'b', 'c', 'd'],
  matrix: [
    [0,  10, 100, 100],
    [10,  0,  10, 100],
    [100, 10,  0,  10],
    [100, 100, 10,  0],
  ],
}

test('returns all place IDs', () => {
  const result = optimizeRoute(matrix)
  expect(result).toHaveLength(4)
  expect(new Set(result)).toEqual(new Set(['a', 'b', 'c', 'd']))
})

test('finds a reasonable short route', () => {
  const result = optimizeRoute(matrix)
  // optimal is a→b→c→d (total 30) — greedy should find this
  const order = result.map((id) => matrix.indices.indexOf(id))
  let total = 0
  for (let i = 0; i < order.length - 1; i++) {
    total += matrix.matrix[order[i]][order[i + 1]]
  }
  expect(total).toBeLessThan(150)  // much less than worst-case 300
})
