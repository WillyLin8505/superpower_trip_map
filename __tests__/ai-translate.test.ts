jest.mock('@/lib/claude', () => ({ callClaude: jest.fn() }))

import { callClaude } from '@/lib/claude'
import { translateTextsToZhTw, translateTextToZhTw } from '@/lib/aiTranslate'

const callClaudeMock = callClaude as jest.Mock
const realFetch = global.fetch

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  global.fetch = realFetch
})

it('translates multiple place names to Traditional Chinese with one AI call', async () => {
  callClaudeMock.mockResolvedValue(JSON.stringify({
    'Wanna Waffle?': '想吃鬆餅？',
    'あべのハルカス': '阿倍野 HARUKAS',
  }))

  const result = await translateTextsToZhTw(['Wanna Waffle?', 'あべのハルカス'])

  expect(result).toEqual({
    'Wanna Waffle?': '想吃鬆餅？',
    'あべのハルカス': '阿倍野 HARUKAS',
  })
  expect(callClaudeMock).toHaveBeenCalledTimes(1)
  expect(callClaudeMock.mock.calls[0][0]).toContain('Wanna Waffle?')
  expect(callClaudeMock.mock.calls[0][0]).toContain('只回 JSON')
})

it('does not call AI for text that is already Chinese', async () => {
  await expect(translateTextToZhTw('河內老城區')).resolves.toBe('河內老城區')
  expect(callClaudeMock).not.toHaveBeenCalled()
})

it('never calls Google Translate fetch', async () => {
  const fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  callClaudeMock.mockResolvedValue('{"Timeline":"時間軸咖啡"}')

  await expect(translateTextToZhTw('Timeline')).resolves.toBe('時間軸咖啡')

  expect(fetchMock).not.toHaveBeenCalled()
})

it('falls back to a local Chinese cafe name when AI translation is unavailable', async () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  callClaudeMock.mockRejectedValue(new Error('Could not resolve authentication method'))

  try {
    await expect(translateTextToZhTw('Orick Coffee')).resolves.toBe('Orick 咖啡')
  } finally {
    consoleErrorSpy.mockRestore()
  }
})

it('fills missing AI translation keys with local Chinese fallbacks', async () => {
  callClaudeMock.mockResolvedValue('{}')

  const result = await translateTextsToZhTw(['Orick Coffee'])

  expect(result).toEqual({ 'Orick Coffee': 'Orick 咖啡' })
})
