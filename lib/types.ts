export type PlaceType = 'attraction' | 'restaurant' | 'dessert'
export type TransportMode = 'driving' | 'walking' | 'transit'

export interface Place {
  id: string
  placeId: string
  name: string
  type: PlaceType
  lat: number
  lng: number
  address: string
  openingHours: string[] | null
  rating: number | null
  photoUrl: string | null
  description: string | null
}

export interface ScheduledPlace extends Place {
  startTime: string
  durationMin: number
  travelMinToNext: number | null
  aiDescription: string | null
  outsideHours: boolean
  lateExit: boolean      // startTime + durationMin exceeds today's closing time
  timeLocked: boolean    // recalc skips this place's startTime and durationMin
}

export interface DayItinerary {
  day: number
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
  reason: string
  sourceLabel: string
  placeId: string | null
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
  indices: string[]
  matrix: number[][]
}
