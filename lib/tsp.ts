export function routeCost(route: number[], m: number[][]): number {
  let c = 0
  for (let i = 0; i < route.length - 1; i++) c += m[route[i]][route[i + 1]]
  return c
}
export function nearestNeighbor(m: number[][], start = 0): number[] {
  const n = m.length
  const visited = new Set<number>([start])
  const route = [start]
  let cur = start
  while (visited.size < n) {
    let best = -1
    let bd = Infinity
    for (let j = 0; j < n; j++) if (!visited.has(j) && m[cur][j] < bd) { best = j; bd = m[cur][j] }
    if (best < 0) break
    visited.add(best); route.push(best); cur = best
  }
  return route
}
export function twoOpt(route: number[], m: number[][]): number[] {
  let best = [...route]
  let improved = true
  while (improved) {
    improved = false
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)]
        if (routeCost(cand, m) < routeCost(best, m)) { best = cand; improved = true }
      }
    }
  }
  return best
}
