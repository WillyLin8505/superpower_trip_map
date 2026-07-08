let lastInsert: Record<string, unknown> | null
let lastUpdate: Record<string, unknown> | null
let lastPredicate: { column: string; value: string } | null

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'line_ingest_jobs') throw new Error(`Unexpected table ${table}`)
      return {
        insert: (payload: Record<string, unknown>) => {
          lastInsert = payload
          return Promise.resolve({ error: null })
        },
        update: (payload: Record<string, unknown>) => {
          lastUpdate = payload
          return {
            eq: (column: string, value: string) => {
              lastPredicate = { column, value }
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }),
}))

beforeEach(() => {
  jest.resetModules()
  lastInsert = null
  lastUpdate = null
  lastPredicate = null
})

it('records a LINE ingest job', async () => {
  const { recordLineIngestJob } = require('@/lib/line/jobs') as typeof import('@/lib/line/jobs')

  await recordLineIngestJob({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm1',
    messageText: '?啣?101',
    eventPayload: { type: 'message' },
  })

  expect(lastInsert).toEqual({
    line_group_id: 'Cg123',
    line_user_id: 'U123',
    message_id: 'm1',
    message_text: '?啣?101',
    event_payload: { type: 'message' },
    status: 'queued',
  })
})

it('marks a job as done or failed', async () => {
  const { markLineIngestJob } = require('@/lib/line/jobs') as typeof import('@/lib/line/jobs')

  await markLineIngestJob('m1', 'done')
  expect(lastUpdate).toEqual({ status: 'done', error: null, processed_at: expect.any(String) })
  expect(lastPredicate).toEqual({ column: 'message_id', value: 'm1' })

  await markLineIngestJob('m2', 'failed', 'boom')
  expect(lastUpdate).toEqual({ status: 'failed', error: 'boom', processed_at: expect.any(String) })
  expect(lastPredicate).toEqual({ column: 'message_id', value: 'm2' })
})
