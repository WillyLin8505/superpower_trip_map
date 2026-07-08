import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LineIngestJobStatus } from '@/lib/types'

function hasPostgresCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

export async function recordLineIngestJob(input: {
  lineGroupId: string
  lineUserId?: string
  messageId: string
  messageText: string
  eventPayload: unknown
}): Promise<'created' | 'duplicate'> {
  const admin = createAdminClient()
  const { error } = await admin.from('line_ingest_jobs').insert({
    line_group_id: input.lineGroupId,
    line_user_id: input.lineUserId ?? null,
    message_id: input.messageId,
    message_text: input.messageText,
    event_payload: input.eventPayload,
    status: 'queued',
  })
  if (hasPostgresCode(error, '23505')) return 'duplicate'
  if (error) throw new Error('LINE_JOB_RECORD_FAILED')
  return 'created'
}

export async function markLineIngestJob(
  messageId: string,
  status: Exclude<LineIngestJobStatus, 'queued' | 'processing'>,
  errorMessage: string | null = null,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('line_ingest_jobs')
    .update({
      status,
      error: errorMessage,
      processed_at: new Date().toISOString(),
    })
    .eq('message_id', messageId)
  if (error) throw new Error('LINE_JOB_UPDATE_FAILED')
}
