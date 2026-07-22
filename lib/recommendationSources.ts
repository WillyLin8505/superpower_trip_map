import 'server-only'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Source } from '@/lib/types'

interface SourceRow {
  id: string
  url: string
  label: string
  last_fetched_at: string | null
  last_fetch_status: 'ok' | 'error' | null
}

function hasSupabaseAdminEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  )
}

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    lastFetchedAt: row.last_fetched_at,
    lastFetchStatus: row.last_fetch_status,
  }
}

async function getSourcesFromSupabase(): Promise<Source[] | null> {
  if (!hasSupabaseAdminEnv()) return null

  try {
    const { data, error } = await createAdminClient()
      .from('sources')
      .select('id, url, label, last_fetched_at, last_fetch_status')
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
    return JSON.parse(raw) as Source[]
  } catch {
    return []
  }
}

export async function getRecommendationSources(): Promise<Source[]> {
  const supabaseSources = await getSourcesFromSupabase()
  return supabaseSources ?? getSourcesFromConfigFile()
}
