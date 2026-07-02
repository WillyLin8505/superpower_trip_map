import { nearestNeighbor, twoOpt, routeCost } from '@/lib/tsp'
const M = [
  [0, 1, 10, 10],
  [1, 0, 1, 10],
  [10, 1, 0, 1],
  [10, 10, 1, 0],
]
it('nearestNeighbor greedily walks nearest', () => {
  expect(nearestNeighbor(M, 0)).toEqual([0, 1, 2, 3])
})
it('routeCost sums consecutive edges', () => {
  expect(routeCost([0, 1, 2, 3], M)).toBe(3)
})
it('twoOpt does not worsen a route', () => {
  const r = twoOpt([0, 2, 1, 3], M)
  expect(routeCost(r, M)).toBeLessThanOrEqual(routeCost([0, 2, 1, 3], M))
})
