import crypto from 'crypto'

describe('LINE primitives', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'token'
  })

  it('verifies valid LINE signatures and rejects invalid signatures', () => {
    const { verifyLineSignature } = require('@/lib/line/signature')
    const body = '{"events":[]}'
    const secret = 'channel-secret'
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64')

    expect(verifyLineSignature(body, signature, secret)).toBe(true)
    expect(verifyLineSignature(body, 'bad', secret)).toBe(false)
  })

  it('parses bind and unbind commands', () => {
    const { parseLineCommand } = require('@/lib/line/commands')

    expect(parseLineCommand('/綁定 https://example.com/join/token-1')).toEqual({
      kind: 'bind',
      tripLinkOrToken: 'https://example.com/join/token-1',
    })
    expect(parseLineCommand('/解除綁定')).toEqual({ kind: 'unbind' })
    expect(parseLineCommand('/綁定')).toEqual({ kind: 'invalid_bind' })
    expect(parseLineCommand('Tokyo Tower')).toEqual({ kind: 'none' })
  })

  it('classifies google maps urls, article urls, plain text, and ignored short text', () => {
    const { classifyLineText } = require('@/lib/line/urlClassifier')

    expect(classifyLineText('https://maps.app.goo.gl/abc')).toEqual({
      kind: 'google_maps_url',
      url: 'https://maps.app.goo.gl/abc',
    })
    expect(classifyLineText('https://www.google.com/maps/place/Tokyo+Tower')).toEqual({
      kind: 'google_maps_url',
      url: 'https://www.google.com/maps/place/Tokyo+Tower',
    })
    expect(classifyLineText('https://www.google.com/search?q=tokyo')).toEqual({
      kind: 'article_url',
      url: 'https://www.google.com/search?q=tokyo',
    })
    expect(classifyLineText('see https://example.com/blog')).toEqual({
      kind: 'article_url',
      url: 'https://example.com/blog',
    })
    expect(classifyLineText('Tokyo Tower')).toEqual({
      kind: 'plain_text',
      query: 'Tokyo Tower',
    })
    expect(classifyLineText('a')).toEqual({ kind: 'ignore' })
  })

  it('sends LINE replies through the Messaging API', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response)

    const { replyLineMessage } = require('@/lib/line/client')
    await replyLineMessage('reply-token', 'hello')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/message/reply',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    )
  })

  it('gets LINE group member profiles through the Messaging API', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ displayName: 'Lane User' }),
    } as Response)

    const { getLineProfile } = require('@/lib/line/client')
    await expect(getLineProfile('group-1', 'user-1')).resolves.toEqual({
      displayName: 'Lane User',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.line.me/v2/bot/group/group-1/member/user-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    )
  })
})
