'use server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import type { Source } from '@/lib/types'

const FILE = join(process.cwd(), 'config/sources.json')

async function readSources(): Promise<Source[]> {
  const raw = await readFile(FILE, 'utf-8').catch(() => '[]')
  return JSON.parse(raw)
}

async function writeSources(sources: Source[]): Promise<void> {
  await writeFile(FILE, JSON.stringify(sources, null, 2), 'utf-8')
}

export async function getSources(): Promise<Source[]> {
  return readSources()
}

export async function addSource(formData: FormData): Promise<void> {
  const url = formData.get('url') as string
  const label = formData.get('label') as string
  if (!url || !label) return
  const sources = await readSources()
  sources.push({ id: randomUUID(), url, label, lastFetchedAt: null, lastFetchStatus: null })
  await writeSources(sources)
  revalidatePath('/admin')
}

export async function deleteSource(id: string): Promise<void> {
  const sources = await readSources()
  await writeSources(sources.filter((s) => s.id !== id))
  revalidatePath('/admin')
}
