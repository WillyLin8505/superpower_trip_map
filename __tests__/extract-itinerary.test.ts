import { extractItinerary } from '@/app/actions/ai'
import { callClaude } from '@/lib/claude'

jest.mock('@/lib/claude')
const mockCallClaude = callClaude as jest.Mock

describe('extractItinerary', () => {
  beforeEach(() => jest.clearAllMocks())

  it('parses simple newline place lists locally without calling AI', async () => {
    const result = await extractItinerary([
      '1. 淺草寺',
      '2. 一蘭拉麵',
      '3. Blue Bottle Coffee',
      '4. 東京塔',
      '5. Hotel Metropolitan Tokyo',
    ].join('\n'))

    expect(mockCallClaude).not.toHaveBeenCalled()
    expect(result.country).toBeNull()
    expect(result.places).toEqual([
      { name: '淺草寺', type: 'attraction' },
      { name: '一蘭拉麵', type: 'restaurant' },
      { name: 'Blue Bottle Coffee', type: 'dessert' },
      { name: '東京塔', type: 'attraction' },
      { name: 'Hotel Metropolitan Tokyo', type: 'accommodation' },
    ])
  })

  it('returns parsed places and country from valid JSON response', async () => {
    mockCallClaude.mockResolvedValue(JSON.stringify({
      country: 'Japan',
      countryCode: 'jp',
      places: [
        { name: '淺草寺', type: 'attraction' },
        { name: '一蘭拉麵', type: 'restaurant' },
      ],
    }))
    const result = await extractItinerary('去東京旅遊')
    expect(result.country).toBe('Japan')
    expect(result.countryCode).toBe('jp')
    expect(result.places).toHaveLength(2)
    expect(result.places[0]).toEqual({ name: '淺草寺', type: 'attraction' })
  })

  it('returns null country when JSON has null country', async () => {
    mockCallClaude.mockResolvedValue(JSON.stringify({
      country: null,
      countryCode: null,
      places: [{ name: '某個地方', type: 'attraction' }],
    }))
    const result = await extractItinerary('隨便一段文字')
    expect(result.country).toBeNull()
    expect(result.countryCode).toBeNull()
    expect(result.places).toHaveLength(1)
  })

  it('strips markdown code fences before parsing', async () => {
    mockCallClaude.mockResolvedValue('```json\n{"country":"Taiwan","countryCode":"tw","places":[{"name":"九份","type":"attraction"}]}\n```')
    const result = await extractItinerary('台灣行程')
    expect(result.country).toBe('Taiwan')
    expect(result.places[0].name).toBe('九份')
  })

  it('returns empty places and null country on unparseable response', async () => {
    mockCallClaude.mockResolvedValue('這不是 JSON')
    const result = await extractItinerary('隨便')
    expect(result.country).toBeNull()
    expect(result.countryCode).toBeNull()
    expect(result.places).toEqual([])
  })

  it('does NOT flag an error for a parseable-but-empty response (genuine no places)', async () => {
    mockCallClaude.mockResolvedValue(JSON.stringify({ country: null, countryCode: null, places: [] }))
    const result = await extractItinerary('沒有地點的文字')
    expect(result.places).toEqual([])
    expect(result.error).toBeUndefined()
  })

  it('flags error: "ai_failed" when the AI call throws (e.g. missing ANTHROPIC_API_KEY)', async () => {
    mockCallClaude.mockRejectedValue(new Error('Could not resolve authentication method'))
    const result = await extractItinerary('去東京旅遊')
    expect(result.error).toBe('ai_failed')
    expect(result.places).toEqual([])
  })
})
