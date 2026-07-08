const verifyLineSignature = jest.fn()
const parseLineText = jest.fn()
const bindLineGroupToTrip = jest.fn()
const unbindLineGroup = jest.fn()
const processLineTextMessage = jest.fn()
const replyLineMessage = jest.fn()
const getLineProfile = jest.fn()
const recordLineIngestJob = jest.fn()
const markLineIngestJob = jest.fn()

jest.mock('@/lib/line/signature', () => ({ verifyLineSignature: (...a: unknown[]) => verifyLineSignature(...a) }))
jest.mock('@/lib/line/parser', () => ({ parseLineText: (...a: unknown[]) => parseLineText(...a) }))
jest.mock('@/lib/line/bindings', () => ({
  bindLineGroupToTrip: (...a: unknown[]) => bindLineGroupToTrip(...a),
  unbindLineGroup: (...a: unknown[]) => unbindLineGroup(...a),
}))
jest.mock('@/lib/line/ingest', () => ({ processLineTextMessage: (...a: unknown[]) => processLineTextMessage(...a) }))
jest.mock('@/lib/line/client', () => ({
  replyLineMessage: (...a: unknown[]) => replyLineMessage(...a),
  getLineProfile: (...a: unknown[]) => getLineProfile(...a),
}))
jest.mock('@/lib/line/jobs', () => ({
  recordLineIngestJob: (...a: unknown[]) => recordLineIngestJob(...a),
  markLineIngestJob: (...a: unknown[]) => markLineIngestJob(...a),
}))

function request(body: unknown, signature = 'sig'): Request {
  return new Request('https://app.example.com/api/line/webhook', {
    method: 'POST',
    headers: { 'x-line-signature': signature },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  process.env.LINE_CHANNEL_SECRET = 'secret'
  verifyLineSignature.mockResolvedValue(true)
  parseLineText.mockReturnValue({ kind: 'place_text', query: '?啣?101' })
  bindLineGroupToTrip.mockResolvedValue({ tripId: 'trip-1' })
  unbindLineGroup.mockResolvedValue(undefined)
  processLineTextMessage.mockResolvedValue({ kind: 'reply', text: '撌脣??亙瘙??啣?101' })
  replyLineMessage.mockResolvedValue(undefined)
  getLineProfile.mockResolvedValue({ displayName: '撠?' })
  recordLineIngestJob.mockResolvedValue(undefined)
  markLineIngestJob.mockResolvedValue(undefined)
})

it('returns 401 for invalid signature', async () => {
  verifyLineSignature.mockResolvedValue(false)
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({ events: [] }))

  expect(res.status).toBe(401)
  expect(replyLineMessage).not.toHaveBeenCalled()
})

it('binds group on bind command and replies success', async () => {
  parseLineText.mockReturnValue({ kind: 'bind', tripLinkOrToken: 'https://app.example.com/join/token-1' })
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({
    events: [{
      type: 'message',
      replyToken: 'reply-1',
      source: { type: 'group', groupId: 'Cg123', userId: 'U123' },
      message: { type: 'text', id: 'm1', text: '/蝬? https://app.example.com/join/token-1' },
    }],
  }))

  expect(res.status).toBe(200)
  expect(bindLineGroupToTrip).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    tripLinkOrToken: 'https://app.example.com/join/token-1',
  })
  expect(replyLineMessage).toHaveBeenCalledWith('reply-1', '撌脩?摰迨 LINE 蝢斤??啗?蝔?')
})

it('does not reply for ignored unbound group message', async () => {
  processLineTextMessage.mockResolvedValue({ kind: 'ignored' })
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({
    events: [{
      type: 'message',
      replyToken: 'reply-1',
      source: { type: 'group', groupId: 'Cg123', userId: 'U123' },
      message: { type: 'text', id: 'm2', text: '?啣?101' },
    }],
  }))

  expect(res.status).toBe(200)
  expect(replyLineMessage).not.toHaveBeenCalled()
})

it('processes bound group text and replies', async () => {
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({
    events: [{
      type: 'message',
      replyToken: 'reply-1',
      source: { type: 'group', groupId: 'Cg123', userId: 'U123' },
      message: { type: 'text', id: 'm2', text: '?啣?101' },
    }],
  }))

  expect(res.status).toBe(200)
  expect(processLineTextMessage).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '撠?',
    messageId: 'm2',
    text: '?啣?101',
  })
  expect(recordLineIngestJob).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm2',
    messageText: '?啣?101',
    eventPayload: expect.objectContaining({ type: 'message' }),
  })
  expect(markLineIngestJob).toHaveBeenCalledWith('m2', 'done')
  expect(replyLineMessage).toHaveBeenCalledWith('reply-1', '撌脣??亙瘙??啣?101')
})

it('records and processes a message when profile lookup fails', async () => {
  getLineProfile.mockRejectedValue(new Error('LINE profile unavailable'))
  processLineTextMessage.mockResolvedValue({ kind: 'ignored' })
  const { POST } = require('@/app/api/line/webhook/route') as typeof import('@/app/api/line/webhook/route')

  const res = await POST(request({
    events: [{
      type: 'message',
      replyToken: 'reply-1',
      source: { type: 'group', groupId: 'Cg123', userId: 'U123' },
      message: { type: 'text', id: 'm3', text: '???101' },
    }],
  }))

  expect(res.status).toBe(200)
  expect(recordLineIngestJob).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm3',
    messageText: '???101',
    eventPayload: expect.objectContaining({ type: 'message' }),
  })
  expect(processLineTextMessage).toHaveBeenCalledWith({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: undefined,
    messageId: 'm3',
    text: '???101',
  })
  expect(markLineIngestJob).toHaveBeenCalledWith('m3', 'ignored')
})
