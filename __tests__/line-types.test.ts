import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'
import type { Candidate, LineCandidateSource, LineGroupBinding, LineIngestJob, Place } from '@/lib/types'

const place: Place = {
  id: 'local-1',
  placeId: 'google-place-1',
  name: '?啣?101',
  type: 'attraction',
  lat: 25.033,
  lng: 121.5654,
  address: '?啣?撣縑蝢拙?',
  openingHours: null,
  rating: 4.7,
  photoUrl: null,
  description: null,
}

it('allows candidates to carry LINE source metadata', () => {
  const source: LineCandidateSource = {
    kind: 'line_group',
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '撠?',
    messageId: 'm1',
    messageText: '?啣?101',
    sourceUrl: 'https://maps.app.goo.gl/example',
  }

  const candidate: Candidate = {
    id: 'c1',
    place,
    addedBy: 'owner-1',
    addedByName: 'Owner',
    source,
  }

  const binding: LineGroupBinding = {
    lineGroupId: 'Cg123',
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  }

  const job: LineIngestJob = {
    id: 'j1',
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm1',
    messageText: '?啣?101',
    status: 'queued',
  }

  expect(candidate.source?.kind).toBe('line_group')
  expect(binding.writeAsUserId).toBe('owner-1')
  expect(job.status).toBe('queued')
})

it('typechecks the LINE schema and shared types', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'line-types-'))
  const tempSource = join(tempDir, 'line-types-check.ts')
  const tempConfig = join(tempDir, 'tsconfig.json')

  writeFileSync(
    tempSource,
    [
      "import type { Candidate, LineCandidateSource, LineGroupBinding, LineIngestJob, Place } from '@/lib/types'",
      '',
      'declare const place: Place',
      'declare const source: LineCandidateSource',
      'declare const candidate: Candidate',
      'declare const binding: LineGroupBinding',
      'declare const job: LineIngestJob',
      '',
      'void place',
      'void source',
      'void candidate',
      'void binding',
      'void job',
      '',
    ].join('\n'),
  )
  writeFileSync(
    tempConfig,
    JSON.stringify(
      {
        extends: resolve('tsconfig.json'),
        include: ['./line-types-check.ts'],
      },
      null,
      2,
    ),
  )

  try {
    execFileSync(process.execPath, [resolve('node_modules/typescript/lib/tsc.js'), '--noEmit', '--pretty', 'false', '--incremental', 'false', '--project', tempConfig], {
      stdio: 'pipe',
    })
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
