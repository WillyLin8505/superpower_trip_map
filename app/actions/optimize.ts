'use server'
import type { DistanceMatrix } from '@/lib/types'
import { nearestNeighbor, twoOpt } from '@/lib/tsp'

export async function optimizeRoute(distMatrix: DistanceMatrix): Promise<string[]> {
  const { indices, matrix } = distMatrix
  const initial = nearestNeighbor(matrix, 0)
  const optimized = twoOpt(initial, matrix)
  return optimized.map((i) => indices[i])
}
