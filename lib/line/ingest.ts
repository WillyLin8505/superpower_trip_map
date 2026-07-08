import 'server-only'
import { extractItinerary } from '@/app/actions/ai'
import { addCandidateFromLine } from '@/app/actions/candidates'
import { searchPlace } from '@/app/actions/places'
import { scrapeText } from '@/app/actions/scrape'
import { getActiveLineGroupBinding } from '@/lib/line/bindings'
import { parseLineText } from '@/lib/line/parser'
import type { LineCandidateSource, Place } from '@/lib/types'

export type LineIngestResult =
  | { kind: 'ignored' }
  | { kind: 'reply'; text: string }

export async function processLineTextMessage(input: {
  lineGroupId: string
  lineUserId?: string
  lineDisplayName?: string
  messageId: string
  text: string
}): Promise<LineIngestResult> {
  const binding = await getActiveLineGroupBinding(input.lineGroupId)
  if (!binding) return { kind: 'ignored' }

  const parsed = parseLineText(input.text)
  if (
    parsed.kind === 'ignored' ||
    parsed.kind === 'bind' ||
    parsed.kind === 'unbind' ||
    parsed.kind === 'malformed_bind'
  ) {
    return { kind: 'ignored' }
  }

  if (parsed.kind === 'place_text' || parsed.kind === 'google_maps_url') {
    const query = parsed.kind === 'place_text' ? parsed.query : parsed.url
    const place = await searchPlace(query)
    if (!place) return { kind: 'reply', text: '?曆??啣??瘙??圈???' }

    const status = await writeLineCandidate(binding.tripId, binding.writeAsUserId, place, {
      input,
      sourceUrl: parsed.kind === 'google_maps_url' ? parsed.url : undefined,
    })
    return {
      kind: 'reply',
      text: status === 'duplicate'
        ? `撌脣?瘙?${place.name}`
        : `撌脣??亙瘙?${place.name}`,
    }
  }

  const text = await scrapeText(parsed.url)
  if (!text) return { kind: 'reply', text: '?急??⊥?閫?????嚗?蝔??岫??' }

  const extracted = await extractItinerary(text)
  let addedCount = 0
  let firstAddedName: string | null = null

  for (const extractedPlace of extracted.places) {
    const place = await searchPlace(extractedPlace.name, extracted.country ?? undefined)
    if (!place) continue

    const typedPlace: Place = { ...place, type: extractedPlace.type }
    const status = await writeLineCandidate(binding.tripId, binding.writeAsUserId, typedPlace, {
      input,
      sourceUrl: parsed.url,
    })
    if (status === 'added') {
      addedCount += 1
      firstAddedName ??= typedPlace.name
    }
  }

  if (addedCount === 0) return { kind: 'reply', text: '?曆??啣??瘙??圈???' }
  if (addedCount === 1) return { kind: 'reply', text: `撌脣??亙瘙?${firstAddedName}` }
  return { kind: 'reply', text: `撌脣???${addedCount} ??` }
}

async function writeLineCandidate(
  tripId: string,
  writeAsUserId: string,
  place: Place,
  sourceInput: {
    input: {
      lineGroupId: string
      lineUserId?: string
      lineDisplayName?: string
      messageId: string
      text: string
    }
    sourceUrl?: string
  },
): Promise<'added' | 'duplicate'> {
  const source: LineCandidateSource = {
    kind: 'line_group',
    lineGroupId: sourceInput.input.lineGroupId,
    lineUserId: sourceInput.input.lineUserId,
    lineDisplayName: sourceInput.input.lineDisplayName,
    messageId: sourceInput.input.messageId,
    messageText: sourceInput.input.text,
    sourceUrl: sourceInput.sourceUrl,
  }

  return addCandidateFromLine({ tripId, writeAsUserId, place, source })
}
