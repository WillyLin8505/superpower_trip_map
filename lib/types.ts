import type { CrowdForecast } from '@/lib/crowd/types'

export type PlaceType = 'attraction' | 'restaurant' | 'dessert' | 'accommodation'
export type TransportMode = 'driving' | 'walking' | 'transit'

export interface Place {
  id: string            // UUID generated client-side
  placeId: string       // Google Place ID
  name: string
  type: PlaceType
  lat: number
  lng: number
  address: string
  openingHours: string[] | null   // e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  rating: number | null
  photoUrl: string | null
  description: string | null   // from Google editorial_summary.overview; null if unavailable
  nightIndex?: number          // 住宿夜次（1-indexed），僅 accommodation
}

export interface ScheduledPlace extends Place {
  startTime: string         // "HH:MM" 24h
  durationMin: number       // minutes
  travelMinToNext: number | null  // null for last place of the day
  aiDescription: string | null
  outsideHours: boolean     // true → show orange warning
  lateExit: boolean         // startTime + durationMin exceeds today's closing time
  startLocked: boolean      // 鎖開始時間：排程錨點 + 不可拖
  durationLocked: boolean   // 鎖停留時間
  legMode?: TransportMode    // 到下一站的交通工具（最後一站 undefined）
  legManualNext?: string     // 有值＝手動指定段，值為當時下一站的 place.id
}

export interface DayItinerary {
  day: number               // 1-indexed
  places: ScheduledPlace[]
  aiSummary: string | null
  dayStart: string          // "HH:MM" 該天活動開始，預設 '09:00'
  dayEnd: string            // "HH:MM" 該天活動結束，預設 '21:00'
  avoidTraffic?: boolean    // 智慧排程：避開壅塞，讀取時 ?? true
  avoidCrowds?: boolean     // 智慧排程：避開人潮，讀取時 ?? true
}

export interface PlanResult {
  days: DayItinerary[]
  transportMode: TransportMode
  startDate: string         // ISO 'YYYY-MM-DD'
}

export interface Recommendation {
  name: string
  type: PlaceType
  reason: string            // Claude's 1-sentence explanation (Traditional Chinese)
  sourceLabel: string       // label from sources.json
  placeId: string | null    // null if Google couldn't verify
  lat: number | null
  lng: number | null
  verified: boolean
}

export interface Source {
  id: string
  url: string
  label: string
  lastFetchedAt: string | null
  lastFetchStatus: 'ok' | 'error' | null
}

export interface DistanceMatrix {
  indices: string[]         // place IDs in order
  matrix: number[][]        // matrix[i][j] = seconds from i to j
}

export interface LegDefault {
  legMode: TransportMode
  travelMin: number
}

export interface DayArrangeInputs {
  indices: string[]                              // placeId → 矩陣列
  matrix: number[][]                             // 秒
  crowdByPlaceId: Record<string, CrowdForecast>  // 僅含成功取得者
}

export interface ArrangeOpts {
  avoidTraffic: boolean
  avoidCrowds: boolean
}
