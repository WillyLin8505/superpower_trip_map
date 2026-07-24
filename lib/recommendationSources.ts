import 'server-only'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeSourceConfig, normalizeSourceKind } from '@/lib/sourceConfig'
import type { Source, SourceKind } from '@/lib/types'

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

interface ConfigSourceRow {
  id: string
  url: string
  label: string
  kind?: string | null
  enabled?: boolean | null
  config?: unknown
  lastFetchedAt?: string | null
  lastFetchStatus?: 'ok' | 'error' | null
}

function hasSupabaseAdminEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
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

function toConfigSource(row: ConfigSourceRow): Source {
  const kind = normalizeSourceKind(row.kind)
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    kind,
    enabled: row.enabled ?? true,
    config: normalizeSourceConfig(row.config, kind),
    lastFetchedAt: row.lastFetchedAt ?? null,
    lastFetchStatus: row.lastFetchStatus ?? null,
  }
}

async function getSourcesFromSupabase(): Promise<Source[] | null> {
  if (!hasSupabaseAdminEnv()) return null

  try {
    const { data, error } = await createAdminClient()
      .from('sources')
      .select('id, url, label, kind, enabled, config, last_fetched_at, last_fetch_status')
      .order('created_at', { ascending: true })

    if (error || !data) return null
    return (data as SourceRow[]).map(toSource)
  } catch {
    return null
  }
}

async function getSourcesFromConfigFile(): Promise<Source[]> {
  try {
    const raw = await readFile(join(process.cwd(), 'config/sources.json'), 'utf-8')
    return (JSON.parse(raw) as ConfigSourceRow[]).map(toConfigSource)
  } catch {
    return []
  }
}

async function getManagedSources(kind: SourceKind): Promise<Source[]> {
  const supabaseSources = await getSourcesFromSupabase()
  const sources = supabaseSources ?? await getSourcesFromConfigFile()
  const managedSources = sources.filter((source) => source.enabled && source.kind === kind)
  if (kind !== 'image') return managedSources
  return managedSources.sort((left, right) => {
    const leftPriority = left.config.priority ?? Number.MAX_SAFE_INTEGER
    const rightPriority = right.config.priority ?? Number.MAX_SAFE_INTEGER
    const priorityDelta = leftPriority - rightPriority
    if (priorityDelta !== 0) return priorityDelta
    return left.label.localeCompare(right.label)
  })
}

export async function getRecommendationSources(): Promise<Source[]> {
  return getManagedSources('recommendation')
}

export async function getImageSources(): Promise<Source[]> {
  return getManagedSources('image')
}
