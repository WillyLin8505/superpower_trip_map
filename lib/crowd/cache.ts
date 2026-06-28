// lib/crowd/cache.ts
import type { CrowdForecast } from './types'

export interface CrowdCache {
  get(key: string): CrowdForecast | undefined
  set(key: string, value: CrowdForecast, ttlMs: number): void
}

interface Entry {
  value: CrowdForecast
  expiresAt: number
}

export class InMemoryCrowdCache implements CrowdCache {
  private store = new Map<string, Entry>()
  private now: () => number

  constructor(now: () => number = () => Date.now()) {
    this.now = now
  }

  get(key: string): CrowdForecast | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (this.now() >= e.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return e.value
  }

  set(key: string, value: CrowdForecast, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: this.now() + ttlMs })
  }
}
