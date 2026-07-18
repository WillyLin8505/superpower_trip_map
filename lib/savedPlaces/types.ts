import type { Place } from '@/lib/types'
import type { SavedPlaceSource } from '@/lib/takeout/parse'

export interface SavedPlaceRow {
  id: string
  listName: string
  source: SavedPlaceSource
  place: Place
}
