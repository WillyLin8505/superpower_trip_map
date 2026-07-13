import { searchPlace } from '@/app/actions/places'

describe('bilingual place search regression', () => {
  const realFetch = global.fetch

  afterEach(() => {
    global.fetch = realFetch
  })

  it('keeps the searched local-language name as original when zh-TW details has a Chinese name', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ candidates: [{ place_id: 'hcm-opera' }] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          status: 'OK',
          result: {
            name: '胡志明市歌劇院',
            geometry: { location: { lat: 10.7766, lng: 106.7032 } },
            formatted_address: '越南胡志明市第一郡',
            opening_hours: null,
            rating: 4.6,
            photos: null,
            editorial_summary: null,
          },
        }),
      })
    global.fetch = fetchMock as unknown as typeof fetch

    const place = await searchPlace('Nhà hát Thành phố Hồ Chí Minh', 'Vietnam')

    expect(place).toEqual(expect.objectContaining({
      name: '胡志明市歌劇院',
      localizedName: {
        zhTw: '胡志明市歌劇院',
        original: 'Nhà hát Thành phố Hồ Chí Minh',
      },
    }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('language=zh-TW')
  })
})
