'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin'
import {
  normalizeImageSourceProvider,
  normalizeSourceConfig,
  normalizeSourceKind,
} from '@/lib/sourceConfig'
import type { Source, SourceConfig, SourceKind } from '@/lib/types'

interface SourceRow {
  id: string
  url: string
  label: string
  kind?: string | null
  enabled?: boolean | null
  config?: unknown
  last_fetched_at: string | null
  last_fetch_status: 'ok' | 'error' | null
}

function toSource(row: SourceRow): Source {
  const kind = normalizeSourceKind(row.kind)
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    kind,
    enabled: row.enabled ?? true,
    config: normalizeSourceConfig(row.config, kind),
    lastFetchedAt: row.last_fetched_at,
    lastFetchStatus: row.last_fetch_status,
  }
}

function getRequiredText(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function getEnabled(formData: FormData): boolean {
  const values = formData.getAll('enabled')
  const value = values.length > 0 ? values[values.length - 1] : null
  if (value == null) return true
  return value === 'true' || value === 'on'
}

function getSourcePayload(formData: FormData): {
  url: string
  label: string
  kind: SourceKind
  enabled: boolean
  config: SourceConfig
} | null {
  const url = getRequiredText(formData, 'url')
  const label = getRequiredText(formData, 'label')
  if (!url || !label) return null

  const kind = normalizeSourceKind(formData.get('kind'))
  const enabled = getEnabled(formData)
  const config: SourceConfig = kind === 'image'
    ? { provider: normalizeImageSourceProvider(formData.get('provider')) }
    : {}

  return { url, label, kind, enabled, config }
}

export async function getSources(): Promise<Source[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sources')
    .select('id, url, label, kind, enabled, config, last_fetched_at, last_fetch_status')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as SourceRow[]).map(toSource)
}

export async function addSource(formData: FormData): Promise<void> {
  await requireAdmin()
  const payload = getSourcePayload(formData)
  if (!payload) return
  const supabase = createAdminClient()
  await supabase.from('sources').insert(payload)
  revalidatePath('/admin')
}

export async function editSource(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const payload = getSourcePayload(formData)
  if (!payload) return
  const supabase = createAdminClient()
  await supabase.from('sources').update(payload).eq('id', id)
  revalidatePath('/admin')
}

export async function deleteSource(id: string): Promise<void> {
  await requireAdmin()
  const supabase = createAdminClient()
  await supabase.from('sources').delete().eq('id', id)
  revalidatePath('/admin')
}
