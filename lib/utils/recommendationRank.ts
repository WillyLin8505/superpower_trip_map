import type { Place, PlaceType } from '@/lib/types'

export type RecommendationCategory = Extract<PlaceType, 'dessert' | 'attraction' | 'restaurant'>

type RankablePlace = Pick<Place, 'type' | 'rating'> & {
  name?: string | null
  reviewCount?: number | null
  categoryTags?: string[] | null
}

interface RecommendationScore {
  total: number
  ratingQuality: number
  reviewConfidence: number
  categoryFit: number
}

const STRONG_CATEGORY_TAGS: Record<RecommendationCategory, Set<string>> = {
  dessert: new Set([
    'bakery', 'cafe', 'coffee_shop', 'dessert', 'dessert_shop', 'ice_cream_shop',
    'confectionery', 'chocolate_shop', 'patisserie', 'cake_shop', 'sweets',
    'tea_house', 'bubble_tea_shop',
  ]),
  attraction: new Set([
    'tourist_attraction', 'landmark', 'museum', 'park', 'place_of_worship',
    'art_gallery', 'amusement_park', 'zoo', 'aquarium', 'natural_feature',
    'historic_site', 'monument', 'castle', 'temple', 'shrine', 'church',
    'cathedral', 'scenic_spot', 'viewpoint',
  ]),
  restaurant: new Set([
    'restaurant', 'meal_takeaway', 'meal_delivery', 'food_court',
    'ramen_restaurant', 'sushi_restaurant', 'taiwanese_restaurant',
    'japanese_restaurant', 'vietnamese_restaurant', 'thai_restaurant',
    'chinese_restaurant', 'korean_restaurant', 'local_lunch', 'local_dinner',
  ]),
}

const WEAK_CATEGORY_TAGS: Record<RecommendationCategory, Set<string>> = {
  dessert: new Set(['food', 'store', 'point_of_interest', 'establishment']),
  attraction: new Set(['point_of_interest', 'establishment', 'premise']),
  restaurant: new Set(['food', 'bar', 'point_of_interest', 'establishment']),
}

const EXCLUDED_CATEGORY_TAGS: Record<RecommendationCategory, Set<string>> = {
  dessert: new Set(['lodging', 'hotel', 'motel', 'hostel', 'resort', 'campground', 'rv_park']),
  attraction: new Set(['lodging', 'hotel', 'motel', 'hostel', 'resort', 'restaurant', 'cafe', 'bakery', 'food']),
  restaurant: new Set(['lodging', 'hotel', 'motel', 'hostel', 'resort', 'campground', 'rv_park']),
}

const DESSERT_SPECIFIC_TAGS = new Set([
  'bakery', 'dessert_shop', 'ice_cream_shop', 'confectionery',
  'chocolate_shop', 'patisserie', 'cake_shop', 'sweets',
])

const DESSERT_BEVERAGE_OR_GENERIC_TAGS = new Set([
  'cafe', 'coffee_shop', 'tea_house', 'bubble_tea_shop',
  'food', 'store', 'point_of_interest', 'establishment',
])

const DESSERT_NAME_CUE_RE =
  /\b(bakery|boba|bubble tea|cake|cacao|cocoa|chocolate|cookie|crepe|dessert|donut|doughnut|dorayaki|gelato|ice cream|juice|juicery|macaron|milk tea|mochi|pancake|pastry|patisserie|pudding|roti|smoothie|sweets?|taiyaki|tart|tea|tra|waffle|yogurt)\b|banh|bánh|che|chè|kem|甜|點|蛋糕|糕|冰淇淋|麻糬|餅|菓子|糖|巧克力|布丁|鬆餅|紅豆/i

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function normalizeTag(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function numericOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizedTags(place: RankablePlace): string[] {
  return (place.categoryTags ?? [])
    .map(normalizeTag)
    .filter(Boolean)
}

function normalizedSearchText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function hasDessertNameCue(place: RankablePlace): boolean {
  const text = normalizedSearchText(place.name)
  return DESSERT_NAME_CUE_RE.test(text)
}

export function recommendationScore(
  place: RankablePlace,
  category: RecommendationCategory
): RecommendationScore {
  const rating = numericOrNull(place.rating)
  const reviewCount = numericOrNull(place.reviewCount)
  const ratingQuality = rating === null ? 0 : clamp01((rating - 3.8) / 1.2)
  const reviewConfidence = reviewCount === null || reviewCount <= 0
    ? 0
    : clamp01(Math.log(reviewCount + 1) / Math.log(10001))
  const categoryFit = recommendationCategoryFit(place, category)

  return {
    total: ratingQuality * 50 + reviewConfidence * 30 + categoryFit * 20,
    ratingQuality,
    reviewConfidence,
    categoryFit,
  }
}

export function recommendationCategoryFit(
  place: RankablePlace,
  category: RecommendationCategory
): number {
  const tags = normalizedTags(place)

  if (tags.some((tag) => EXCLUDED_CATEGORY_TAGS[category].has(tag))) return 0
  if (tags.some((tag) => STRONG_CATEGORY_TAGS[category].has(tag))) return 1
  if (place.type === category && tags.some((tag) => WEAK_CATEGORY_TAGS[category].has(tag))) return 0.85
  if (place.type === category && tags.length === 0) return 0.75
  if (place.type === category) return 0.65
  if (tags.some((tag) => WEAK_CATEGORY_TAGS[category].has(tag))) return 0.35
  return 0
}

export function isRecommendationCandidateAcceptable(
  place: RankablePlace,
  category: RecommendationCategory
): boolean {
  const score = recommendationScore(place, category)
  if (score.categoryFit <= 0) return false

  if (category !== 'dessert') return true

  const tags = normalizedTags(place).filter((tag) => tag !== category)
  const hasQualitySignal = numericOrNull(place.rating) !== null || (numericOrNull(place.reviewCount) ?? 0) > 0
  const hasSpecificDessertSignal = tags.some((tag) => DESSERT_SPECIFIC_TAGS.has(tag))
  const hasNameDessertSignal = hasDessertNameCue(place)
  const isBeverageOnly = tags.length > 0 && tags.every((tag) => DESSERT_BEVERAGE_OR_GENERIC_TAGS.has(tag))

  return hasQualitySignal || hasSpecificDessertSignal || hasNameDessertSignal || !isBeverageOnly
}

export function compareRecommendationCandidates<T extends RankablePlace>(
  left: T,
  right: T,
  category: RecommendationCategory
): number {
  const leftScore = recommendationScore(left, category)
  const rightScore = recommendationScore(right, category)
  const leftFits = leftScore.categoryFit > 0
  const rightFits = rightScore.categoryFit > 0
  if (leftFits !== rightFits) return rightFits ? 1 : -1
  return rightScore.total - leftScore.total
}

export function sortRecommendationCandidates<T extends RankablePlace>(
  candidates: T[],
  category: RecommendationCategory
): T[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) =>
      compareRecommendationCandidates(left.candidate, right.candidate, category) ||
      left.index - right.index
    )
    .map(({ candidate }) => candidate)
}
