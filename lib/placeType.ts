import type { PlaceType } from '@/lib/types'

// Display order for type picker and card metadata.
export const PLACE_TYPES: PlaceType[] = ['accommodation', 'restaurant', 'dessert', 'attraction']

export interface TypeMeta {
  label: string
  emoji: string
  badge: string
  cardBg: string
  accent: string
}

export const TYPE_META: Record<PlaceType, TypeMeta> = {
  attraction: {
    label: '景點',
    emoji: '📷',
    badge: 'bg-attraction-tint text-attraction-ink',
    cardBg: 'bg-surface',
    accent: 'border-l-attraction',
  },
  accommodation: {
    label: '住宿',
    emoji: '🏨',
    badge: 'bg-lodging-tint text-lodging-ink',
    cardBg: 'bg-surface',
    accent: 'border-l-lodging',
  },
  restaurant: {
    label: '餐廳',
    emoji: '🍴',
    badge: 'bg-restaurant-tint text-restaurant-ink',
    cardBg: 'bg-surface',
    accent: 'border-l-restaurant',
  },
  dessert: {
    label: '甜點',
    emoji: '🍰',
    badge: 'bg-dessert-tint text-dessert-ink',
    cardBg: 'bg-surface',
    accent: 'border-l-dessert',
  },
}

export const DWELL: Record<PlaceType, number> = {
  attraction: 90,
  restaurant: 60,
  dessert: 60,
  accommodation: 60,
}

export function inferType(query: string): PlaceType {
  const q = query.toLowerCase()
  if (
    q.includes('飯店') || q.includes('旅館') || q.includes('旅店') || q.includes('民宿') ||
    q.includes('住宿') || q.includes('度假村') || q.includes('hotel') || q.includes('hostel') ||
    q.includes('motel') || q.includes('resort') || q.includes('guesthouse') || q.includes('airbnb') ||
    q.includes('ホテル') || q.includes('ryokan')
  ) return 'accommodation'
  if (
    q.includes('甜點') || q.includes('dessert') || q.includes('咖啡') || q.includes('cafe') ||
    q.includes('ice cream') || q.includes('蛋糕')
  ) return 'dessert'
  if (
    q.includes('餐') || q.includes('restaurant') || q.includes('食堂') || q.includes('bistro')
  ) return 'restaurant'
  return 'attraction'
}

export function validateType(t: string): PlaceType {
  return t === 'restaurant' || t === 'dessert' || t === 'accommodation'
    ? t
    : 'attraction'
}
