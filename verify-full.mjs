// One-off end-to-end DB smoke test (not committed). Creates a temp auth user,
// exercises trips + trip_candidates, checks anon RLS, then cleans up.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('./.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const ok = (m) => console.log('✅', m)
const bad = (m) => console.log('❌', m)
let userId

try {
  // 1. temp user
  const email = `smoke-${Math.abs([...url].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 1e6}@example.com`
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password: 'Sm0ke!' + email.length, email_confirm: true })
  if (ue) throw new Error('createUser: ' + ue.message)
  userId = u.user.id
  ok(`created temp auth user ${userId.slice(0, 8)}…`)

  // 2. trip (owner FK → auth.users)
  const { data: trip, error: te } = await admin.from('trips')
    .insert({ owner_id: userId, title: 'smoke trip', plan: { days: [], transportMode: 'driving', startDate: '2026-07-07' } })
    .select('id').single()
  if (te) throw new Error('insert trip: ' + te.message)
  ok(`inserted trip ${trip.id.slice(0, 8)}… (FK owner_id → auth.users works)`)

  // 3. candidate (C3/C4 table; FKs trip_id + added_by)
  const place = { id: 'p1', placeId: 'p1', name: '台北101', type: 'attraction', lat: 25.03, lng: 121.56, address: '', openingHours: null, rating: null, photoUrl: null, description: null }
  const { data: cand, error: ce } = await admin.from('trip_candidates')
    .insert({ trip_id: trip.id, place, added_by: userId }).select('id, place').single()
  if (ce) throw new Error('insert candidate: ' + ce.message)
  ok(`inserted candidate ${cand.id.slice(0, 8)}… place=${cand.place.name} (jsonb round-trips)`)

  // 4. read back
  const { data: list, error: le } = await admin.from('trip_candidates').select('id, place, added_by').eq('trip_id', trip.id)
  if (le) throw new Error('list candidates: ' + le.message)
  ok(`listCandidates read back ${list.length} row(s), name=${list[0]?.place?.name}`)

  // 5. RLS: anon (unauthenticated) must NOT see the trip or candidate
  const { data: anonTrips } = await anon.from('trips').select('id')
  const { data: anonCands } = await anon.from('trip_candidates').select('id')
  if ((anonTrips?.length ?? 0) === 0 && (anonCands?.length ?? 0) === 0) ok('RLS: anon sees 0 trips + 0 candidates (owner/participant-only enforced)')
  else bad(`RLS LEAK: anon saw trips=${anonTrips?.length} candidates=${anonCands?.length}`)
} catch (e) {
  bad('FAILED: ' + e.message)
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    console.log(error ? `⚠️  cleanup deleteUser error: ${error.message}` : '🧹 cleaned up temp user (cascade removed trip + candidate)')
  }
}
