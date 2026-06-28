import { inferType, validateType, TYPE_META, DWELL, PLACE_TYPES } from '@/lib/placeType'

describe('inferType', () => {
  it('detects accommodation keywords', () => {
    expect(inferType('Toyoko Hotel')).toBe('accommodation')
    expect(inferType('某某飯店')).toBe('accommodation')
    expect(inferType('阿里山民宿')).toBe('accommodation')
  })
  it('does not regress restaurant/dessert/attraction (guards removed "inn" bug)', () => {
    expect(inferType('dinner restaurant')).toBe('restaurant')
    expect(inferType('蛋糕店')).toBe('dessert')
    expect(inferType('淺草寺')).toBe('attraction')
  })
})

describe('validateType', () => {
  it('passes through known types', () => {
    expect(validateType('accommodation')).toBe('accommodation')
    expect(validateType('restaurant')).toBe('restaurant')
    expect(validateType('dessert')).toBe('dessert')
  })
  it('falls back to attraction for unknown', () => {
    expect(validateType('foo')).toBe('attraction')
  })
})

describe('type maps', () => {
  it('PLACE_TYPES, TYPE_META and DWELL cover all four types', () => {
    expect(PLACE_TYPES).toHaveLength(4)
    for (const t of PLACE_TYPES) {
      expect(TYPE_META[t]).toBeDefined()
      expect(typeof DWELL[t]).toBe('number')
    }
  })
})
