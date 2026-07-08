const fetchMock = jest.fn()
global.fetch = fetchMock

beforeEach(() => {
  fetchMock.mockReset()
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'token'
})

it('replies to LINE with bearer token', async () => {
  fetchMock.mockResolvedValue({ ok: true })
  const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')

  await replyLineMessage('reply-token', '撌脣??亙瘙??啣?101')

  expect(fetchMock).toHaveBeenCalledWith('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      replyToken: 'reply-token',
      messages: [{ type: 'text', text: '撌脣??亙瘙??啣?101' }],
    }),
  })
})
