// One-off DB smoke test (not committed). Uses service_role key (bypasses RLS) to
// check the Lane C tables exist on the linked Supabase project.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('MISSING url or service_role key in .env.local'); process.exit(2) }
console.log('URL:', url)
console.log('service_role key present:', key.length, 'chars')

const supabase = createClient(url, key, { auth: { persistSession: false } })

const tables = ['trips', 'trip_members', 'trip_candidates']
for (const t of tables) {
  const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true })
  if (!error) console.log(`✅ ${t}: exists (rows=${count ?? '?'})`)
  else if (error.code === '42P01') console.log(`❌ ${t}: MISSING (migration not applied)`)
  else console.log(`⚠️  ${t}: error ${error.code} — ${error.message}`)
}
