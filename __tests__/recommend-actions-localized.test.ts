import { getRecommendations } from '@/app/actions/recommend'
import { callClaude } from '@/lib/claude'
import { scrapeText } from '@/app/actions/scrape'
import { verifyPlace } from '@/app/actions/places'

jest.mock('fs/promises', () => ({
  readFile: jest.fn(async () => JSON.stringify([{ id: 'src-1', url: 'https://example.com', label: '測試來源', lastFetchedAt: null, lastFetchStatus: null }])),
}))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))
jest.mock('@/lib/claude', () => ({ callClaude: jest.fn() }))
jest.mock('@/app/actions/places', () => ({ verifyPlace: jest.fn() }))

const mockScrape = scrapeText as jest.Mock
const mockClaude = callClaude as jest.Mock
const mockVerifyPlace = verifyPlace as jest.Mock

describe('getRecommendations localized fields', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('preserves localized fields from verified Google place data', async () => {
    mockScrape.mockResolvedValue('推薦國立故宮博物院')
    mockClaude.mockResolvedValue(JSON.stringify([
      {
        name: 'National Palace Museum',
        type: 'attraction',
        reason: '適合安排半日參觀。',
        sourceLabel: '測試來源',
      },
    ]))
    mockVerifyPlace.mockResolvedValue({
      placeId: 'place-1',
      lat: 25.102,
      lng: 121.548,
      localizedName: {
        zhTw: '國立故宮博物院',
        en: 'National Palace Museum',
        original: 'National Palace Museum',
      },
      localizedAddress: {
        zhTw: '台北市士林區至善路二段221號',
        original: '台北市士林區至善路二段221號',
      },
    })

    const result = await getRecommendations([])

    expect(result[0]).toEqual(expect.objectContaining({
      name: 'National Palace Museum',
      localizedName: {
        zhTw: '國立故宮博物院',
        en: 'National Palace Museum',
        original: 'National Palace Museum',
      },
      localizedAddress: {
        zhTw: '台北市士林區至善路二段221號',
        original: '台北市士林區至善路二段221號',
      },
    }))
  })
})
