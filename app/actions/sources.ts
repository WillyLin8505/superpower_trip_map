'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin'
import type { Source } from '@/lib/types'

interface SourceRow {
  id: string
  url: string
  label: string
  last_fetched_at: string | null
  last_fetch_status: 'ok' | 'error' | null
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

export async function getSources(): Promise<Source[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sources')
    .select('id, url, label, last_fetched_at, last_fetch_status')
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return (data as SourceRow[]).map(toSource)
}

export async function addSource(formData: FormData): Promise<void> {
  await requireAdmin()
  const url = formData.get('url') as string
  const label = formData.get('label') as string
  if (!url || !label) return
  const supabase = createAdminClient()
  await supabase.from('sources').insert({ url, label })
  revalidatePath('/admin')
}

export async function editSource(id: string, formData: FormData): Promise<void> {
  await requireAdmin()
  const url = formData.get('url') as string
  const label = formData.get('label') as string
  if (!url || !label) return
  const supabase = createAdminClient()
  await supabase.from('sources').update({ url, label }).eq('id', id)
  revalidatePath('/admin')
}

export async function deleteSource(id: string): Promise<void> {
  await requireAdmin()
  const supabase = createAdminClient()
  await supabase.from('sources').delete().eq('id', id)
  revalidatePath('/admin')
}
