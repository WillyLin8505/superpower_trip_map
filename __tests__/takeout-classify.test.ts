import { classifyPlaceType } from '@/lib/takeout/classify'

it('maps bakery/cafe/ice_cream to dessert', () => {
  expect(classifyPlaceType(['bakery', 'store'])).toBe('dessert')
  expect(classifyPlaceType(['cafe'])).toBe('dessert')
  expect(classifyPlaceType(['ice_cream_shop'])).toBe('dessert')
})

it('maps restaurant/food/meal to restaurant', () => {
  expect(classifyPlaceType(['restaurant', 'food'])).toBe('restaurant')
  expect(classifyPlaceType(['meal_takeaway'])).toBe('restaurant')
})

it('maps lodging to accommodation', () => {
  expect(classifyPlaceType(['lodging'])).toBe('accommodation')
})

it('falls back to attraction', () => {
  expect(classifyPlaceType(['tourist_attraction'])).toBe('attraction')
  expect(classifyPlaceType([])).toBe('attraction')
})

it('prefers dessert over restaurant when both present (cafe that also serves food)', () => {
  expect(classifyPlaceType(['cafe', 'restaurant', 'food'])).toBe('dessert')
})
