import { NextResponse } from 'next/server'
import { bindLineGroupToTrip, unbindLineGroup } from '@/lib/line/bindings'
import { getLineProfile, replyLineMessage } from '@/lib/line/client'
import { processLineTextMessage } from '@/lib/line/ingest'
import { markLineIngestJob, recordLineIngestJob } from '@/lib/line/jobs'
import { parseLineText } from '@/lib/line/parser'
import { verifyLineSignature } from '@/lib/line/signature'

type LineWebhookBody = { events?: LineEvent[] }
type LineEvent = {
  type?: string
  replyToken?: string
  source?: {
    type?: string
    groupId?: string
    roomId?: string
    userId?: string
  }
  message?: {
    type?: string
    id?: string
    text?: string
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  const signature = request.headers.get('x-line-signature')
  const valid = await verifyLineSignature(body, signature, process.env.LINE_CHANNEL_SECRET)
  if (!valid) return new NextResponse('invalid signature', { status: 401 })

  const payload = JSON.parse(body) as LineWebhookBody
  for (const event of payload.events ?? []) {
    await handleEvent(event)
  }

  return NextResponse.json({ ok: true })
}

async function handleEvent(event: LineEvent): Promise<void> {
  if (event.type !== 'message' || event.message?.type !== 'text') return

  const lineGroupId = event.source?.groupId ?? event.source?.roomId
  const replyToken = event.replyToken
  const text = event.message.text ?? ''
  const messageId = event.message.id ?? ''

  if (!lineGroupId || !replyToken || !messageId) {
    if (replyToken && event.source?.type === 'user') {
      await replyLineMessage(replyToken, '隢? bot ? LINE 蝢斤?敺?蝬?銵???')
    }
    return
  }

  const parsed = parseLineText(text)
  if (parsed.kind === 'malformed_bind') {
    await replyLineMessage(replyToken, '隢撓??/蝬? <銵??澈???>')
    return
  }

  if (parsed.kind === 'bind') {
    try {
      await bindLineGroupToTrip({ lineGroupId, tripLinkOrToken: parsed.tripLinkOrToken })
      await replyLineMessage(replyToken, '撌脩?摰迨 LINE 蝢斤??啗?蝔?')
    } catch {
      await replyLineMessage(replyToken, '?曆??圈?蝔?隢Ⅱ隤?鈭恍???臬甇?Ⅱ??')
    }
    return
  }

  if (parsed.kind === 'unbind') {
    await unbindLineGroup({ lineGroupId })
    await replyLineMessage(replyToken, '撌脰圾?斗迨 LINE 蝢斤???蝔?摰?')
    return
  }

  const profile = event.source?.userId
    ? await getLineProfile(lineGroupId, event.source.userId)
    : null

  await recordLineIngestJob({
    lineGroupId,
    lineUserId: event.source?.userId,
    messageId,
    messageText: text,
    eventPayload: event,
  })

  let result
  try {
    result = await processLineTextMessage({
      lineGroupId,
      lineUserId: event.source?.userId,
      lineDisplayName: profile?.displayName,
      messageId,
      text,
    })
    await markLineIngestJob(messageId, result.kind === 'ignored' ? 'ignored' : 'done')
  } catch (error) {
    await markLineIngestJob(messageId, 'failed', error instanceof Error ? error.message : 'unknown error')
    throw error
  }

  if (result.kind === 'reply') {
    await replyLineMessage(replyToken, result.text)
  }
}
