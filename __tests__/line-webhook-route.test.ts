import type { NextRequest } from 'next/server'

import { POST } from '@/app/api/line/webhook/route'
import { LINE_BIND_COMMAND, LINE_MESSAGES, LINE_UNBIND_COMMAND } from '@/lib/line/messages'

jest.mock('@/lib/line/signature', () => ({ verifyLineSignature: jest.fn() }))
jest.mock('@/lib/line/bindings', () => ({
  bindLineGroupToTrip: jest.fn(),
  unbindLineGroup: jest.fn(),
}))
jest.mock('@/lib/line/ingest', () => ({ processLineTextMessage: jest.fn() }))
jest.mock('@/lib/line/client', () => ({ replyLineMessage: jest.fn() }))

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'message',
    replyToken: 'reply-token-1',
    source: {
      type: 'group',
      groupId: 'group-1',
      userId: 'user-1',
    },
    message: {
      type: 'text',
      id: 'msg-1',
      text: 'hello',
    },
    ...overrides,
  }
}

function makeRequest(body: string, signature = 'valid-signature') {
  return new Request('http://localhost/api/line/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-line-signature': signature,
    },
    body,
  })
}

describe('POST /api/line/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.LINE_CHANNEL_SECRET = 'line-secret'
  })

  it('returns 401 for invalid LINE signature', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    ;(verifyLineSignature as jest.Mock).mockReturnValue(false)

    const body = JSON.stringify({ events: [] })
    const response = await POST(makeRequest(body, 'bad-signature') as NextRequest)

    expect(verifyLineSignature).toHaveBeenCalledWith(body, 'bad-signature', 'line-secret')
    expect(response.status).toBe(401)
    await expect(response.text()).resolves.toBe('invalid signature')
  })

  it('returns 200 for an empty valid event list', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    ;(verifyLineSignature as jest.Mock).mockReturnValue(true)

    const response = await POST(makeRequest(JSON.stringify({ events: [] })) as NextRequest)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('bind command replies success', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    const { bindLineGroupToTrip } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
    const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')
    ;(verifyLineSignature as jest.Mock).mockReturnValue(true)
    ;(bindLineGroupToTrip as jest.Mock).mockResolvedValue({ tripId: 'trip-1' })

    const response = await POST(
      makeRequest(
        JSON.stringify({
          events: [makeEvent({ message: { type: 'text', id: 'msg-1', text: `${LINE_BIND_COMMAND} invite-123` } })],
        }),
      ) as NextRequest,
    )

    expect(response.status).toBe(200)
    expect(bindLineGroupToTrip).toHaveBeenCalledWith({
      lineGroupId: 'group-1',
      tripLinkOrToken: 'invite-123',
    })
    expect(replyLineMessage).toHaveBeenCalledWith('reply-token-1', LINE_MESSAGES.bindSuccess)
  })

  it('bind command replies usage for missing token', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    const { bindLineGroupToTrip } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
    const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')
    ;(verifyLineSignature as jest.Mock).mockReturnValue(true)

    const response = await POST(
      makeRequest(
        JSON.stringify({
          events: [makeEvent({ message: { type: 'text', id: 'msg-1', text: LINE_BIND_COMMAND } })],
        }),
      ) as NextRequest,
    )

    expect(response.status).toBe(200)
    expect(bindLineGroupToTrip).not.toHaveBeenCalled()
    expect(replyLineMessage).toHaveBeenCalledWith('reply-token-1', LINE_MESSAGES.bindUsage)
  })

  it('unbind command replies success', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    const { unbindLineGroup } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
    const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')
    ;(verifyLineSignature as jest.Mock).mockReturnValue(true)
    ;(unbindLineGroup as jest.Mock).mockResolvedValue('unbound')

    const response = await POST(
      makeRequest(
        JSON.stringify({
          events: [makeEvent({ message: { type: 'text', id: 'msg-1', text: LINE_UNBIND_COMMAND } })],
        }),
      ) as NextRequest,
    )

    expect(response.status).toBe(200)
    expect(unbindLineGroup).toHaveBeenCalledWith({ lineGroupId: 'group-1' })
    expect(replyLineMessage).toHaveBeenCalledWith('reply-token-1', LINE_MESSAGES.unbindSuccess)
  })

  it('unbound group ordinary message does not reply', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')
    const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')
    ;(verifyLineSignature as jest.Mock).mockReturnValue(true)
    ;(processLineTextMessage as jest.Mock).mockResolvedValue({ reply: null, status: 'ignored' })

    const response = await POST(
      makeRequest(JSON.stringify({ events: [makeEvent({ message: { type: 'text', id: 'msg-1', text: 'Tokyo Tower' } })] })) as NextRequest,
    )

    expect(response.status).toBe(200)
    expect(processLineTextMessage).toHaveBeenCalledWith({
      lineGroupId: 'group-1',
      lineUserId: 'user-1',
      messageId: 'msg-1',
      text: 'Tokyo Tower',
    })
    expect(replyLineMessage).not.toHaveBeenCalled()
  })

  it('bound group plain text calls processLineTextMessage and replies with its reply', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')
    const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')
    ;(verifyLineSignature as jest.Mock).mockReturnValue(true)
    ;(processLineTextMessage as jest.Mock).mockResolvedValue({
      reply: LINE_MESSAGES.added('Tokyo Tower'),
      status: 'done',
    })

    const response = await POST(
      makeRequest(JSON.stringify({ events: [makeEvent({ message: { type: 'text', id: 'msg-1', text: 'Tokyo Tower' } })] })) as NextRequest,
    )

    expect(response.status).toBe(200)
    expect(processLineTextMessage).toHaveBeenCalledWith({
      lineGroupId: 'group-1',
      lineUserId: 'user-1',
      messageId: 'msg-1',
      text: 'Tokyo Tower',
    })
    expect(replyLineMessage).toHaveBeenCalledWith(
      'reply-token-1',
      LINE_MESSAGES.added('Tokyo Tower'),
    )
  })

  it('waits for ingest work before acknowledging a valid webhook', async () => {
    const { verifyLineSignature } = require('@/lib/line/signature') as typeof import('@/lib/line/signature')
    const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')
    const { replyLineMessage } = require('@/lib/line/client') as typeof import('@/lib/line/client')
    let resolveIngest!: (value: { reply: string | null; status: 'done' }) => void
    const slowIngest = new Promise<{ reply: string | null; status: 'done' }>((resolve) => {
      resolveIngest = resolve
    })
    ;(verifyLineSignature as jest.Mock).mockReturnValue(true)
    ;(processLineTextMessage as jest.Mock).mockReturnValue(slowIngest)

    const responsePromise = POST(
      makeRequest(JSON.stringify({ events: [makeEvent({ message: { type: 'text', id: 'msg-1', text: 'https://example.com/slow' } })] })) as NextRequest,
    )
    await Promise.resolve()

    let settled = false
    responsePromise.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    resolveIngest({ reply: null, status: 'done' })
    const response = await responsePromise
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(processLineTextMessage).toHaveBeenCalledWith({
      lineGroupId: 'group-1',
      lineUserId: 'user-1',
      messageId: 'msg-1',
      text: 'https://example.com/slow',
    })
    expect(replyLineMessage).not.toHaveBeenCalled()
  })
})
