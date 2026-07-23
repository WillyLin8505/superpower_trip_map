import { shouldServeGooglePhotoMedia, shouldUseGooglePhotoFallback, shouldUsePaidRecommendationFallback } from '@/lib/googleMapsCost'

describe('googleMapsCost', () => {
  const originalPhotoMode = process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE
  const originalPhotoMediaMode = process.env.GOOGLE_MAPS_PHOTO_MEDIA_MODE
  const originalRecommendationMode = process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    if (originalPhotoMode === undefined) delete process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE
    else process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE = originalPhotoMode
    if (originalPhotoMediaMode === undefined) delete process.env.GOOGLE_MAPS_PHOTO_MEDIA_MODE
    else process.env.GOOGLE_MAPS_PHOTO_MEDIA_MODE = originalPhotoMediaMode
    if (originalRecommendationMode === undefined) delete process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE
    else process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = originalRecommendationMode
    process.env.NODE_ENV = originalNodeEnv
  })

  it('keeps Google photo fallback on by default in tests', () => {
    delete process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE
    process.env.NODE_ENV = 'test'

    expect(shouldUseGooglePhotoFallback()).toBe(true)
  })

  it('keeps Google photo fallback off by default in production', () => {
    delete process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE
    process.env.NODE_ENV = 'production'

    expect(shouldUseGooglePhotoFallback()).toBe(false)
  })

  it('lets production disable Google photo fallback explicitly', () => {
    process.env.GOOGLE_MAPS_PHOTO_FALLBACK_MODE = 'off'

    expect(shouldUseGooglePhotoFallback()).toBe(false)
  })

  it('keeps Google photo media off by default in production', () => {
    delete process.env.GOOGLE_MAPS_PHOTO_MEDIA_MODE
    process.env.NODE_ENV = 'production'

    expect(shouldServeGooglePhotoMedia()).toBe(false)
  })

  it('allows Google photo media only when explicitly enabled', () => {
    process.env.GOOGLE_MAPS_PHOTO_MEDIA_MODE = 'on'
    process.env.NODE_ENV = 'production'

    expect(shouldServeGooglePhotoMedia()).toBe(true)
  })

  it('keeps Google recommendation fallback on by default in tests', () => {
    delete process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE
    process.env.NODE_ENV = 'test'

    expect(shouldUsePaidRecommendationFallback()).toBe(true)
  })

  it('keeps Google recommendation fallback on by default so categories can fill to five', () => {
    delete process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE
    process.env.NODE_ENV = 'production'

    expect(shouldUsePaidRecommendationFallback()).toBe(true)
  })

  it('lets production disable paid recommendation fallback explicitly', () => {
    process.env.GOOGLE_MAPS_RECOMMENDATION_PAID_FALLBACK_MODE = 'off'

    expect(shouldUsePaidRecommendationFallback()).toBe(false)
  })
})
