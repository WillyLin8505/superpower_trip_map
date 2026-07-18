jest.mock('@/lib/aiTranslate', () => ({
  translateTextToZhTw: jest.fn(),
}))

import { getPlaceDetails, nearbySearch } from '@/app/actions/places'
import { translateTextToZhTw } from '@/lib/aiTranslate'

const vietnameseName = 'VOU Cafe - T\u1ed5ng D\u00e2n'
const englishName = 'VOU Cafe - Tong Dan'
const chineseName = '沃咖啡 - 總壇'

function detailsResult(name: string, address = 'Hanoi') {
  return {
    status: 'OK',
    result: {
      name,
      geometry: { location: { lat: 21.0278, lng: 105.8342 } },
      formatted_address: address,
      opening_hours: null,
      rating: 4.7,
      photos: null,
      editorial_summary: null,
    },
  }
}

describe('bilingual Google recommendation names regression', () => {
  const realFetch = global.fetch
  const translateTextToZhTwMock = translateTextToZhTw as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    translateTextToZhTwMock.mockResolvedValue(null)
  })

  afterEach(() => {
    global.fetch = realFetch
  })

  it('uses AI translation as Chinese primary and default-language details as native secondary', async () => {
    translateTextToZhTwMock.mockResolvedValue(chineseName)
    const fetchMock = jest.fn(async (url: string) => {
      const language = new URL(url).searchParams.get('language')
      return {
        json: async () => detailsResult(language ? englishName : vietnameseName),
      }
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const place = await getPlaceDetails('vou-cafe')

    expect(place).toEqual(expect.objectContaining({
      name: chineseName,
      localizedName: {
        zhTw: chineseName,
        en: englishName,
        original: vietnameseName,
      },
    }))
    expect(translateTextToZhTwMock).toHaveBeenCalledWith(vietnameseName)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('translation.googleapis.com'))).toBe(false)
  })

  it('latinizes the original name when Google cannot provide a separate English name', async () => {
    global.fetch = jest.fn(async () => ({
      json: async () => detailsResult(vietnameseName),
    })) as unknown as typeof fetch

    const place = await getPlaceDetails('vou-cafe')

    expect(place).toEqual(expect.objectContaining({
      name: englishName,
      localizedName: {
        zhTw: null,
        en: englishName,
        original: vietnameseName,
      },
    }))
  })

  it('adds translated Chinese primary and native secondary to nearby Google recommendation candidates', async () => {
    translateTextToZhTwMock.mockResolvedValue(chineseName)
    global.fetch = jest.fn(async () => {
      return {
        json: async () => ({
          status: 'OK',
          results: [
            {
              place_id: 'vou-cafe',
              name: vietnameseName,
              geometry: { location: { lat: 21.0278, lng: 105.8342 } },
              vicinity: 'H\u00e0 N\u1ed9i',
              rating: 4.7,
              photos: [{ photo_reference: 'photo-1' }],
            },
          ],
        }),
      }
    }) as unknown as typeof fetch

    const places = await nearbySearch(21.0278, 105.8342, 'dessert')

    expect(places[0]).toEqual(expect.objectContaining({
      name: chineseName,
      localizedName: {
        zhTw: chineseName,
        original: vietnameseName,
      },
      photoUrl: '/api/photo?ref=photo-1',
    }))
    expect(translateTextToZhTwMock).toHaveBeenCalledWith(vietnameseName)
  })
})
