import { resolveLocalizedAddress, resolveLocalizedText } from '@/lib/utils/localizedPlace'

describe('resolveLocalizedText', () => {
  it('uses Traditional Chinese as primary and English as secondary', () => {
    const resolved = resolveLocalizedText(
      { zhTw: '國立故宮博物院', en: 'National Palace Museum', original: 'National Palace Museum' },
      'Fallback Name'
    )

    expect(resolved).toEqual({
      primary: '國立故宮博物院',
      secondary: 'National Palace Museum',
    })
  })

  it('uses English when Traditional Chinese is missing', () => {
    const resolved = resolveLocalizedText(
      { zhTw: null, en: 'National Palace Museum', original: 'Original Museum' },
      'Fallback Name'
    )

    expect(resolved).toEqual({
      primary: 'National Palace Museum',
      secondary: 'Original Museum',
    })
  })

  it('uses original when localized Chinese and English are missing', () => {
    const resolved = resolveLocalizedText(
      { original: 'Source Name' },
      'Fallback Name'
    )

    expect(resolved).toEqual({
      primary: 'Source Name',
      secondary: 'Fallback Name',
    })
  })

  it('uses legacy fallback when localized fields are missing', () => {
    const resolved = resolveLocalizedText(null, 'Legacy Name')

    expect(resolved).toEqual({
      primary: 'Legacy Name',
      secondary: null,
    })
  })

  it('hides secondary text when the next value duplicates primary after trimming', () => {
    const resolved = resolveLocalizedText(
      { zhTw: '國立故宮博物院', en: ' 國立故宮博物院 ', original: '國立故宮博物院' },
      '國立故宮博物院'
    )

    expect(resolved).toEqual({
      primary: '國立故宮博物院',
      secondary: null,
    })
  })
})

describe('resolveLocalizedAddress', () => {
  it('uses Traditional Chinese address first', () => {
    expect(resolveLocalizedAddress(
      { zhTw: '台北市士林區至善路二段221號', en: 'No. 221, Sec. 2, Zhishan Rd.', original: 'Original Address' },
      'Fallback Address'
    )).toBe('台北市士林區至善路二段221號')
  })

  it('falls back through English, original, then legacy address', () => {
    expect(resolveLocalizedAddress({ en: 'English Address', original: 'Original Address' }, 'Legacy Address')).toBe('English Address')
    expect(resolveLocalizedAddress({ original: 'Original Address' }, 'Legacy Address')).toBe('Original Address')
    expect(resolveLocalizedAddress(null, 'Legacy Address')).toBe('Legacy Address')
  })

  it('returns null when no address value exists', () => {
    expect(resolveLocalizedAddress({}, '')).toBeNull()
  })
})
