import type { CrowdForecast } from '@/lib/crowd/types'

export type PlaceType = 'attraction' | 'restaurant' | 'dessert' | 'accommodation'
export type TransportMode = 'driving' | 'walking' | 'transit'
export type PlaceDataSource = 'google' | 'overture' | 'osm' | 'wikidata' | 'user'

export interface LocalizedText {
  zhTw?: string | null
  en?: string | null
  original?: string | null
}

export interface Place {
  id: string            // UUID generated client-side
  placeId: string       // Google Place ID
  source?: PlaceDataSource
  name: string
  localizedName?: LocalizedText | null
  type: PlaceType
  lat: number
  lng: number
  address: string
  localizedAddress?: LocalizedText | null
  openingHours: string[] | null   // e.g. ["Monday: 9:00 AM – 5:00 PM", ...]
  rating: number | null
  reviewCount?: number | null
  categoryTags?: string[]
  photoUrl: string | null
  photoUrls?: string[]
  description: string | null   // from Google editorial_summary.overview; null if unavailable
  nightIndex?: number          // 住宿夜次（1-indexed），僅 accommodation
}

export interface ScheduledPlace extends Place {
  startTime: string         // "HH:MM" 24h
  durationMin: number       // minutes
  travelMinToNext: number | null  // null for last place of the day
  travelDistanceToNext?: number | null  // 到下一站的路程距離(公尺);null/undefined = 未知
  aiDescription: string | null
  outsideHours: boolean     // true → show orange warning
  lateExit: boolean         // startTime + durationMin exceeds today's closing time
  startLocked: boolean      // 鎖開始時間：排程錨點 + 不可拖
  durationLocked: boolean   // 鎖停留時間
  endLocked?: boolean        // 鎖結束時間（可選;讀取一律 ?? false）
  legMode?: TransportMode    // 到下一站的交通工具（最後一站 undefined）
  legManualNext?: string     // 有值＝手動指定段，值為當時下一站的 place.id
}

// 該天的推薦中心（DEC-303/304）：只影響推薦查詢，不影響智慧排程／路線／地圖
export interface RecommendationCenter {
  placeId: string | null
  name: string
  lat: number
  lng: number
  address: string | null
  source: 'manual' | 'fallback'
}

export interface DayItinerary {
  day: number               // 1-indexed
  places: ScheduledPlace[]
  aiSummary: string | null
  dayStart: string          // "HH:MM" 該天活動開始，預設 '09:00'
  dayEnd: string            // "HH:MM" 該天活動結束，預設 '21:00'
  avoidTraffic?: boolean    // 智慧排程：避開壅塞，讀取時 ?? true
  avoidCrowds?: boolean     // 智慧排程：避開人潮，讀取時 ?? true
  recommendationCenter?: RecommendationCenter | null // 未設定的既有行程視為 null（DEC-303）
}

export interface PlanResult {
  days: DayItinerary[]
  transportMode: TransportMode
  startDate: string         // ISO 'YYYY-MM-DD'
  recommendations?: RecommendationsByDay | null
  recommendationsCacheKey?: string | null
  recommendationsCachedAt?: string | null
}

export interface DayRecommendation extends Place {
  reason: string            // Claude's 1-sentence rationale, or generic text for Places fills
  sourceLabel: string       // website label, or 'Google 推薦' for Places fills
}

export interface CategoryArrays {
  dessert: DayRecommendation[]
  attraction: DayRecommendation[]
  restaurant: DayRecommendation[]
}

export interface CategoryList {
  shown: DayRecommendation[]      // up to 5 — displayed
  reserve: DayRecommendation[]    // leftover website picks, already enriched (may be empty)
}

export interface CategoryBuckets {
  dessert: CategoryList
  attraction: CategoryList
  restaurant: CategoryList
}

export type RecommendationsByDay = CategoryBuckets[]  // index 0 = day 1

export type SourceKind = 'recommendation' | 'image'

export type ImageSourceProvider =
  | 'official_website'
  | 'rebake'
  | 'yahoo_map'
  | 'tabelog'
  | 'wikidata'
  | 'wikipedia'
  | 'wikimedia_commons'
  | 'openverse'
  | 'custom'

export type ImageSourceScope =
  | 'regional_official'
  | 'national_official'
  | 'public_database'
  | 'public_media'
  | 'commercial_directory'
  | 'custom'

export interface SourceConfig {
  provider?: ImageSourceProvider
  scope?: ImageSourceScope
  country?: string
  region?: string
  condition?: string
  priority?: number
  notes?: string
}

export interface Source {
  id: string
  url: string
  label: string
  kind: SourceKind
  enabled: boolean
  config: SourceConfig
  lastFetchedAt: string | null
  lastFetchStatus: 'ok' | 'error' | null
}

export interface DistanceMatrix {
  indices: string[]         // place IDs in order
  matrix: number[][]        // matrix[i][j] = seconds from i to j
  distances?: number[][]    // distances[i][j] = 公尺 from i to j(Google 路程,fallback haversine 直線)
}

export interface LegDefault {
  legMode: TransportMode
  travelMin: number
  travelDistanceM?: number  // 路程距離(公尺)
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

export interface TripSummary {
  id: string
  title: string
  updatedAt: string   // ISO
  role?: TripAccessRole
}

export type TripAccessRole = 'owner' | 'editor' | 'viewer'
export type TripLinkAccess = 'restricted' | 'view' | 'edit'

export interface TripMember {
  userId: string
  name: string
  avatarUrl: string | null
  role: 'owner' | 'editor'
  isSelf: boolean
}

export interface Candidate {
  id: string
  place: Place
  addedBy: string
  addedByName: string
  source?: CandidateSource | null
}

// --- LINE group candidate ingest (C5) ---
export interface LineCandidateSource {
  kind: 'line_group'
  lineGroupId: string
  lineUserId?: string
  lineDisplayName?: string
  messageId: string
  messageText?: string
  sourceUrl?: string
}

export type CandidateSource = LineCandidateSource

export interface TripCandidate {
  id: string
  tripId: string
  placeId: string | null
  place: Place
  addedBy: string
  addedByName: string | null
  source: CandidateSource | null
  createdAt: string
}
