import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import ts from 'typescript'

const fixtureSource = `
import type { LineCandidateSource, TripCandidate } from '@/lib/types'

const source: LineCandidateSource = {
  kind: 'line_group',
  lineGroupId: 'group-1',
  lineUserId: 'line-user-1',
  lineDisplayName: 'Mina',
  messageId: 'msg-1',
  messageText: 'Tokyo Tower',
  sourceUrl: 'https://maps.google.com/?q=Tokyo%20Tower',
}

const candidate: TripCandidate = {
  id: 'candidate-1',
  tripId: 'trip-1',
  placeId: 'place-1',
  place: {
    id: 'place-local-1',
    placeId: 'place-1',
    name: 'Tokyo Tower',
    type: 'attraction',
    lat: 35.6586,
    lng: 139.7454,
    address: '4 Chome-2-8 Shibakoen',
    openingHours: null,
    rating: null,
    photoUrl: null,
    description: null,
  },
  addedBy: 'owner-1',
  addedByName: null,
  source,
  createdAt: '2026-07-10T00:00:00.000Z',
}

candidate.source?.kind
`

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

    if (!diagnostic.file || diagnostic.start == null) {
      return message
    }

    const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)

    return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`
  })
}

it('allows a LINE source on a trip candidate', () => {
  const repoRoot = process.cwd()
  const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, 'tsconfig.json')

  expect(configPath).toBeTruthy()

  const { config } = ts.readConfigFile(configPath!, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, repoRoot)
  parsed.options.incremental = false
  const fixturePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'line-types-')), 'fixture.ts')

  fs.writeFileSync(fixturePath, fixtureSource)

  const program = ts.createProgram({
    rootNames: [fixturePath],
    options: parsed.options,
  })

  const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')

    return !text.includes("Subsequent variable declarations must have the same type. Variable 'describe'") &&
      !text.includes("Subsequent variable declarations must have the same type. Variable 'it'") &&
      !text.includes("Subsequent variable declarations must have the same type. Variable 'test'")
  })

  expect(formatDiagnostics(diagnostics)).toEqual([])
})
