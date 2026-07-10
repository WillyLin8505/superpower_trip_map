import type { NextRequest } from 'next/server'

import { bindLineGroupToTrip, unbindLineGroup } from '@/lib/line/bindings'
import { replyLineMessage } from '@/lib/line/client'
import { parseLineCommand } from '@/lib/line/commands'
import { processLineTextMessage } from '@/lib/line/ingest'
import { LINE_MESSAGES } from '@/lib/line/messages'
import { verifyLineSignature } from '@/lib/line/signature'

type LineWebhookEvent = {
  type: string
  replyToken?: string
  source?: { type?: string; groupId?: string; userId?: string }
  message?: { type?: string; id?: string; text?: string }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('x-line-signature')

  if (!verifyLineSignature(body, signature, process.env.LINE_CHANNEL_SECRET ?? '')) {
    return new Response('invalid signature', { status: 401 })
  }

  const payload = JSON.parse(body) as { events?: LineWebhookEvent[] }
  void Promise.all((payload.events ?? []).map((event) => handleEvent(event))).catch((error) => {
    console.error('LINE_WEBHOOK_EVENT_FAILED', error)
  })

  return Response.json({ ok: true })
}

async function handleEvent(event: LineWebhookEvent): Promise<void> {
  if (event.type !== 'message') return
  if (event.message?.type !== 'text' || !event.message.text || !event.message.id) return
  if (!event.replyToken) return

  const lineGroupId = event.source?.groupId
  const lineUserId = event.source?.userId
  const command = parseLineCommand(event.message.text)

  if (!lineGroupId) {
    if (command.kind !== 'none') {
      await replyLineMessage(event.replyToken, LINE_MESSAGES.bindUsage)
    }
    return
  }

  if (command.kind === 'invalid_bind') {
    await replyLineMessage(event.replyToken, LINE_MESSAGES.bindUsage)
    return
  }

  if (command.kind === 'bind') {
    const result = await bindLineGroupToTrip({
      lineGroupId,
      tripLinkOrToken: command.tripLinkOrToken,
    })
    const reply =
      result === 'already_bound'
        ? LINE_MESSAGES.bindAlreadyActive
        : result === 'not_found'
          ? LINE_MESSAGES.bindTripNotFound
          : LINE_MESSAGES.bindSuccess
    await replyLineMessage(event.replyToken, reply)
    return
  }

  if (command.kind === 'unbind') {
    const result = await unbindLineGroup({ lineGroupId })
    await replyLineMessage(
      event.replyToken,
      result === 'unbound' ? LINE_MESSAGES.unbindSuccess : LINE_MESSAGES.unbindNotBound,
    )
    return
  }

  const result = await processLineTextMessage({
    lineGroupId,
    lineUserId,
    messageId: event.message.id,
    text: event.message.text,
  })

  if (result.reply) {
    await replyLineMessage(event.replyToken, result.reply)
  }
}
