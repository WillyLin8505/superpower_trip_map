import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlanResult } from '@/lib/types'

type DiagnosticStep = {
  name: string
  ok: boolean
  detail?: unknown
  error?: unknown
}

function serializeError(error: unknown) {
  if (!error) return null
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return error
}

function summarizeSupabaseError(error: unknown) {
  const candidate = error as { code?: string; message?: string; details?: string; hint?: string } | null
  if (!candidate) return null
  return {
    code: candidate.code,
    message: candidate.message,
    details: candidate.details,
    hint: candidate.hint,
  }
}

async function captureStep(
  steps: DiagnosticStep[],
  name: string,
  fn: () => Promise<unknown>,
): Promise<unknown> {
  try {
    const detail = await fn()
    steps.push({ name, ok: true, detail })
    return detail
  } catch (error) {
    steps.push({ name, ok: false, error: serializeError(error) })
    return null
  }
}

const diagnosticPlan: PlanResult = {
  days: [],
  transportMode: 'driving',
  startDate: '2026-07-12',
}

export async function POST() {
  const runId = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const steps: DiagnosticStep[] = []
  let insertedTripId: string | null = null

  try {
    const adminUser = await requireAdmin()
    if (!adminUser) throw new Error('NOT_ADMIN')
    steps.push({
      name: 'admin-auth',
      ok: true,
      detail: { userId: adminUser.id, email: adminUser.email ?? null },
    })

    const supabase = createClient()
    const service = createAdminClient()

    const userResult = await captureStep(steps, 'server-cookie-auth', async () => {
      const { data, error } = await supabase.auth.getUser()
      if (error) throw summarizeSupabaseError(error)
      if (!data.user) throw new Error('NO_SERVER_COOKIE_USER')
      return { userId: data.user.id, email: data.user.email ?? null }
    }) as { userId: string; email: string | null } | null

    await captureStep(steps, 'schema-trips-columns', async () => {
      const { error } = await service
        .from('trips')
        .select('id, owner_id, title, plan, invite_token, invite_code, created_at, updated_at')
        .limit(1)
      if (error) throw summarizeSupabaseError(error)
      return { checked: ['invite_token', 'invite_code'] }
    })

    for (const table of ['trip_candidates', 'trip_line_groups', 'line_ingest_jobs', 'sources']) {
      await captureStep(steps, `schema-${table}`, async () => {
        const { error } = await service.from(table).select('*').limit(1)
        if (error) throw summarizeSupabaseError(error)
        return { table }
      })
    }

    if (userResult?.userId) {
      const insertResult = await captureStep(steps, 'rls-insert-trip-as-current-user', async () => {
        const { data, error } = await supabase
          .from('trips')
          .insert({
            owner_id: userResult.userId,
            title: `__diagnostic__ ${runId}`,
            plan: diagnosticPlan,
          })
          .select('id, owner_id, title')
          .single()
        if (error) throw summarizeSupabaseError(error)
        if (!data?.id) throw new Error('INSERT_RETURNED_NO_ID')
        insertedTripId = data.id as string
        return data
      }) as { id: string } | null

      if (insertResult?.id) {
        await captureStep(steps, 'rls-update-trip-as-current-user', async () => {
          const { data, error } = await supabase
            .from('trips')
            .update({ title: `__diagnostic_updated__ ${runId}` })
            .eq('id', insertResult.id)
            .select('id, title')
          if (error) throw summarizeSupabaseError(error)
          if (!data?.length) throw new Error('UPDATE_AFFECTED_ZERO_ROWS')
          return { rows: data.length, row: data[0] }
        })

        await captureStep(steps, 'rls-select-trip-as-current-user', async () => {
          const { data, error } = await supabase
            .from('trips')
            .select('id, owner_id, title, plan')
            .eq('id', insertResult.id)
            .single()
          if (error) throw summarizeSupabaseError(error)
          return data
        })

        await captureStep(steps, 'rls-delete-trip-as-current-user', async () => {
          const { data, error } = await supabase
            .from('trips')
            .delete()
            .eq('id', insertResult.id)
            .select('id')
          if (error) throw summarizeSupabaseError(error)
          if (!data?.length) throw new Error('DELETE_AFFECTED_ZERO_ROWS')
          insertedTripId = null
          return { rows: data.length }
        })
      }
    }
  } catch (error) {
    steps.push({ name: 'diagnostic-unhandled-error', ok: false, error: serializeError(error) })
  } finally {
    if (insertedTripId) {
      try {
        const service = createAdminClient()
        await service.from('trips').delete().eq('id', insertedTripId)
        steps.push({ name: 'cleanup-service-delete-trip', ok: true, detail: { tripId: insertedTripId } })
      } catch (error) {
        steps.push({ name: 'cleanup-service-delete-trip', ok: false, error: serializeError(error) })
      }
    }
  }

  const ok = steps.every((step) => step.ok)
  const payload = {
    ok,
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    steps,
  }

  const logPayload = JSON.stringify(payload)
  if (ok) {
    console.info(`[save-diagnostics:${runId}] ok ${logPayload}`)
  } else {
    console.error(`[save-diagnostics:${runId}] failed ${logPayload}`)
  }

  return NextResponse.json(payload, { status: ok ? 200 : 500 })
}
