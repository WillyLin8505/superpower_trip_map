'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin'
import {
  normalizeImageSourceProvider,
  normalizeImageSourceScope,
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

function getOptionalText(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function getOptionalPriority(formData: FormData): number | undefined {
  const value = getOptionalText(formData, 'priority')
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined
}

function compactConfig(config: SourceConfig): SourceConfig {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined && value !== '')
  ) as SourceConfig
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
  const config: SourceConfig = compactConfig(kind === 'image'
    ? {
      provider: normalizeImageSourceProvider(formData.get('provider')),
      scope: normalizeImageSourceScope(formData.get('scope')),
      country: getOptionalText(formData, 'country')?.toUpperCase(),
      region: getOptionalText(formData, 'region'),
      condition: getOptionalText(formData, 'condition'),
      priority: getOptionalPriority(formData),
      notes: getOptionalText(formData, 'notes'),
    }
    : {
      notes: getOptionalText(formData, 'notes'),
    })

  return { url, label, kind, enabled, config }
}

function sourceSortKey(source: Source): number {
  if (source.kind !== 'image') return Number.MAX_SAFE_INTEGER
  return source.config.priority ?? Number.MAX_SAFE_INTEGER
}

function sortSources(sources: Source[]): Source[] {
  return [...sources].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'image' ? -1 : 1
    const priorityDelta = sourceSortKey(left) - sourceSortKey(right)
    if (priorityDelta !== 0) return priorityDelta
    return left.label.localeCompare(right.label, 'zh-Hant')
  })
}

export async function getSources(): Promise<Source[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sources')
    .select('id, url, label, kind, enabled, config, last_fetched_at, last_fetch_status')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return sortSources((data as SourceRow[]).map(toSource))
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

export async function reorderImageSources(sourceIds: string[]): Promise<void> {
  await requireAdmin()
  const ids = sourceIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
  if (ids.length === 0) return

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('sources')
    .select('id, kind, config')
    .in('id', ids)

  const rows = Array.isArray(data) ? data as Array<{ id: string; kind?: string | null; config?: unknown }> : []
  const configById = new Map(rows
    .filter((row) => normalizeSourceKind(row.kind) === 'image')
    .map((row) => [row.id, normalizeSourceConfig(row.config, 'image')]))

  for (const [index, id] of ids.entries()) {
    const config = configById.get(id)
    if (!config) continue
    await supabase
      .from('sources')
      .update({ config: { ...config, priority: (index + 1) * 10 } })
      .eq('id', id)
  }

  revalidatePath('/admin')
}
