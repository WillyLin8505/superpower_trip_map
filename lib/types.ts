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
}

export interface ScheduledPlace extends Place {
  startTime: string         // "HH:MM" 24h
  durationMin: number       // minutes
  travelMinToNext: number | null  // null for last place of the day
  aiDescription: string | null
  outsideHours: boolean     // true → show orange warning
  lateExit: boolean         // startTime + durationMin exceeds today's closing time
  timeLocked: boolean       // recalc skips this place's startTime and durationMin
}

export interface DayItinerary {
  day: number               // 1-indexed
  places: ScheduledPlace[]
  aiSummary: string | null
}

export interface PlanResult {
  days: DayItinerary[]
  transportMode: TransportMode
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
