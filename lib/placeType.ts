import type { PlaceType } from '@/lib/types'

// 顯示與 UI 排序用的固定順序（彈出選單依此順序）
export const PLACE_TYPES: PlaceType[] = ['accommodation', 'restaurant', 'dessert', 'attraction']

export interface TypeMeta {
  label: string        // 中文標籤
  emoji: string
  badge: string        // 徽章 Tailwind 類別（背景+文字）
  cardBg: string       // 卡片底色 Tailwind 類別
}

export const TYPE_META: Record<PlaceType, TypeMeta> = {
  attraction:    { label: '景點', emoji: '🏔', badge: 'bg-blue-100 text-blue-700',     cardBg: 'bg-blue-50' },
  accommodation: { label: '住宿', emoji: '🏨', badge: 'bg-purple-100 text-purple-700', cardBg: 'bg-purple-50' },
  restaurant:    { label: '餐廳', emoji: '🍽', badge: 'bg-amber-100 text-amber-700',   cardBg: 'bg-amber-50' },
  dessert:       { label: '甜點', emoji: '🍰', badge: 'bg-pink-100 text-pink-700',     cardBg: 'bg-pink-50' },
}

// 預設停留時間（分鐘）。accommodation 暫定 60，僅為佔位避免排程出錯；
// 真正的住宿排程語意由子專案 #3 定義。
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
