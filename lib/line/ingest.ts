import 'server-only'

import { randomUUID } from 'crypto'

import { extractItinerary } from '@/app/actions/ai'
import { searchPlace, verifyPlace } from '@/app/actions/places'
import { scrapeText } from '@/app/actions/scrape'
import { addCandidateFromLine } from '@/lib/candidates'
import type { LineCandidateSource, Place } from '@/lib/types'

import { getActiveLineGroupBinding } from './bindings'
import { getLineProfile } from './client'
import { LINE_MESSAGES } from './messages'
import { classifyLineText } from './urlClassifier'

export async function processLineTextMessage(input: {
  lineGroupId: string
  lineUserId?: string
  messageId: string
  text: string
}): Promise<{ reply: string | null; status: 'done' | 'ignored' | 'failed' }> {
  const binding = await getActiveLineGroupBinding(input.lineGroupId)
  if (!binding) {
    return { reply: null, status: 'ignored' }
  }

  const classification = classifyLineText(input.text)
  if (classification.kind === 'ignore') {
    return { reply: null, status: 'ignored' }
  }

  const profile = input.lineUserId
    ? await getLineProfile(input.lineGroupId, input.lineUserId)
    : null

  const sourceBase: Omit<LineCandidateSource, 'sourceUrl'> = {
    kind: 'line_group',
    lineGroupId: input.lineGroupId,
    lineUserId: input.lineUserId,
    lineDisplayName: profile?.displayName,
    messageId: input.messageId,
    messageText: input.text,
  }

  if (classification.kind === 'article_url') {
    return processArticleUrl({
      tripId: binding.tripId,
      writeAsUserId: binding.writeAsUserId,
      url: classification.url,
      sourceBase,
    })
  }

  const place =
    classification.kind === 'google_maps_url'
      ? await searchPlace(classification.url)
      : await searchPlace(classification.query)

  if (!place) {
    return { reply: LINE_MESSAGES.noPlaceFound, status: 'done' }
  }

  const result = await addCandidateFromLine({
    tripId: binding.tripId,
    writeAsUserId: binding.writeAsUserId,
    place,
    source: {
      ...sourceBase,
      sourceUrl: classification.kind === 'google_maps_url' ? classification.url : undefined,
    },
  })

  return {
    reply: result === 'duplicate' ? LINE_MESSAGES.duplicate(place.name) : LINE_MESSAGES.added(place.name),
    status: 'done',
  }
}

async function processArticleUrl(input: {
  tripId: string
  writeAsUserId: string
  url: string
  sourceBase: Omit<LineCandidateSource, 'sourceUrl'>
}): Promise<{ reply: string | null; status: 'done' | 'ignored' | 'failed' }> {
  const text = await scrapeText(input.url)
  if (!text) {
    return { reply: LINE_MESSAGES.articleFailed, status: 'failed' }
  }

  const extracted = await extractItinerary(text)
  let added = 0

  for (const item of extracted.places) {
    const verified = await verifyPlace(item.name)
    if (!verified?.placeId || verified.lat == null || verified.lng == null) {
      continue
    }

    const place: Place = {
      id: randomUUID(),
      placeId: verified.placeId,
      name: item.name,
      localizedName: verified.localizedName,
      type: item.type,
      lat: verified.lat,
      lng: verified.lng,
      address: '',
      localizedAddress: verified.localizedAddress,
      openingHours: null,
      rating: null,
      photoUrl: null,
      description: null,
    }

    const result = await addCandidateFromLine({
      tripId: input.tripId,
      writeAsUserId: input.writeAsUserId,
      place,
      source: {
        ...input.sourceBase,
        sourceUrl: input.url,
      },
    })

    if (result === 'added') {
      added += 1
    }
  }

  if (added === 0) {
    return { reply: LINE_MESSAGES.noPlaceFound, status: 'done' }
  }

  return {
    reply: added === 1 ? LINE_MESSAGES.added('1 個地點') : LINE_MESSAGES.addedMany(added),
    status: 'done',
  }
}
