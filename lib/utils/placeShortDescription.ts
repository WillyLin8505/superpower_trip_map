import type { PlaceType } from '@/lib/types'

export function placeShortDescription(placeType: PlaceType, types: string[] = []): string | null {
  const typeSet = new Set(types)

  if (placeType === 'dessert') {
    if (typeSet.has('bakery') && typeSet.has('cafe')) return '蛋糕店／咖啡廳'
    if (typeSet.has('bakery')) return '蛋糕店／甜點店'
    if (typeSet.has('cafe')) return '咖啡廳／飲料店'
    if (typeSet.has('ice_cream_store')) return '冰品甜點'
    return '甜點／飲料店'
  }

  if (placeType === 'restaurant') {
    if (typeSet.has('meal_takeaway')) return '外帶餐點／午晚餐'
    if (typeSet.has('cafe')) return '咖啡簡餐／午晚餐'
    return '當地午餐／晚餐'
  }

  if (placeType === 'attraction') {
    if (typeSet.has('museum')) return '博物館／文化景點'
    if (typeSet.has('park')) return '公園／散步景點'
    if (typeSet.has('shopping_mall')) return '購物／室內景點'
    if (typeSet.has('tourist_attraction')) return '景點／拍照散步'
    return '景點／在地體驗'
  }

  if (placeType === 'accommodation') return '住宿／休息點'
  return null
}
