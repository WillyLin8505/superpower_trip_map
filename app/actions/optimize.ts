'use server'
import type { DistanceMatrix } from '@/lib/types'

function nearestNeighbor(matrix: number[][], start = 0): number[] {
  const n = matrix.length
  const visited = new Set<number>([start])
  const route = [start]
  let current = start
  while (visited.size < n) {
    let best = -1
    let bestDist = Infinity
    for (let j = 0; j < n; j++) {
      if (!visited.has(j) && matrix[current][j] < bestDist) {
        best = j
        bestDist = matrix[current][j]
      }
    }
    visited.add(best)
    route.push(best)
    current = best
  }
  return route
}

function routeCost(route: number[], matrix: number[][]): number {
  let cost = 0
  for (let i = 0; i < route.length - 1; i++) {
    cost += matrix[route[i]][route[i + 1]]
  }
  return cost
}

function twoOpt(route: number[], matrix: number[][]): number[] {
  let improved = true
  let best = [...route]
  while (improved) {
    improved = false
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const newRoute = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ]
        if (routeCost(newRoute, matrix) < routeCost(best, matrix)) {
          best = newRoute
          improved = true
        }
      }
    }
  }
  return best
}

export function optimizeRoute(distMatrix: DistanceMatrix): string[] {
  const { indices, matrix } = distMatrix
  const initial = nearestNeighbor(matrix, 0)
  const optimized = twoOpt(initial, matrix)
  return optimized.map((i) => indices[i])
}
