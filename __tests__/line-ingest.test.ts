import type { ExtractedItinerary } from '@/app/actions/ai'
import type { Place } from '@/lib/types'

jest.mock('@/lib/line/bindings', () => ({ getActiveLineGroupBinding: jest.fn() }))
jest.mock('@/app/actions/places', () => ({ searchPlace: jest.fn(), verifyPlace: jest.fn() }))
jest.mock('@/app/actions/scrape', () => ({ scrapeText: jest.fn() }))
jest.mock('@/app/actions/ai', () => ({ extractItinerary: jest.fn() }))
jest.mock('@/lib/candidates', () => ({ addCandidateFromLine: jest.fn() }))
jest.mock('@/lib/line/client', () => ({ getLineProfile: jest.fn() }))

function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: 'place-client-1',
    placeId: 'place-1',
    name: 'Tokyo Tower',
    localizedName: {
      zhTw: '東京鐵塔',
      original: 'Tokyo Tower',
    },
    type: 'attraction',
    lat: 35.6586,
    lng: 139.7454,
    address: 'Tokyo',
    localizedAddress: {
      zhTw: '東京',
      original: 'Tokyo',
    },
    openingHours: null,
    rating: 4.6,
    photoUrl: null,
    description: null,
    ...overrides,
  }
}

function loadIngest() {
  return require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')
}

function lineInput(overrides: Partial<{
  lineGroupId: string
  lineUserId?: string
  messageId: string
  text: string
}> = {}) {
  return {
    lineGroupId: 'group-1',
    lineUserId: 'user-1',
    messageId: 'msg-1',
    text: 'Tokyo Tower',
    ...overrides,
  }
}

beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

it('ignores unbound groups without a reply', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
  ;(getActiveLineGroupBinding as jest.Mock).mockResolvedValue(null)

  const { processLineTextMessage } = loadIngest()

  await expect(processLineTextMessage(lineInput())).resolves.toEqual({
    reply: null,
    status: 'ignored',
  })
})

it('adds the first verified Google Maps/plain text place and replies added', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
  const { searchPlace } = require('@/app/actions/places') as typeof import('@/app/actions/places')
  const { addCandidateFromLine } = require('@/lib/candidates') as typeof import('@/lib/candidates')
  const { getLineProfile } = require('@/lib/line/client') as typeof import('@/lib/line/client')
  const { LINE_MESSAGES } = require('@/lib/line/messages') as typeof import('@/lib/line/messages')
  const place = makePlace()

  ;(getActiveLineGroupBinding as jest.Mock).mockResolvedValue({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  ;(getLineProfile as jest.Mock).mockResolvedValue({ displayName: 'Lane User' })
  ;(searchPlace as jest.Mock).mockResolvedValue(place)
  ;(addCandidateFromLine as jest.Mock).mockResolvedValue('added')

  const { processLineTextMessage } = loadIngest()

  await expect(
    processLineTextMessage(lineInput({ text: 'https://maps.app.goo.gl/tokyo' })),
  ).resolves.toEqual({
    reply: LINE_MESSAGES.added('Tokyo Tower'),
    status: 'done',
  })

  expect(searchPlace).toHaveBeenCalledWith('https://maps.app.goo.gl/tokyo')
  expect(addCandidateFromLine).toHaveBeenCalledWith({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place,
    source: {
      kind: 'line_group',
      lineGroupId: 'group-1',
      lineUserId: 'user-1',
      lineDisplayName: 'Lane User',
      messageId: 'msg-1',
      messageText: 'https://maps.app.goo.gl/tokyo',
      sourceUrl: 'https://maps.app.goo.gl/tokyo',
    },
  })
})

it('adds a plain text place search result and replies added', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
  const { searchPlace } = require('@/app/actions/places') as typeof import('@/app/actions/places')
  const { addCandidateFromLine } = require('@/lib/candidates') as typeof import('@/lib/candidates')
  const { getLineProfile } = require('@/lib/line/client') as typeof import('@/lib/line/client')
  const { LINE_MESSAGES } = require('@/lib/line/messages') as typeof import('@/lib/line/messages')
  const place = makePlace()

  ;(getActiveLineGroupBinding as jest.Mock).mockResolvedValue({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  ;(getLineProfile as jest.Mock).mockResolvedValue({ displayName: 'Lane User' })
  ;(searchPlace as jest.Mock).mockResolvedValue(place)
  ;(addCandidateFromLine as jest.Mock).mockResolvedValue('added')

  const { processLineTextMessage } = loadIngest()

  await expect(processLineTextMessage(lineInput({ text: 'Tokyo Tower' }))).resolves.toEqual({
    reply: LINE_MESSAGES.added('Tokyo Tower'),
    status: 'done',
  })

  expect(searchPlace).toHaveBeenCalledWith('Tokyo Tower')
  expect(addCandidateFromLine).toHaveBeenCalledWith({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place,
    source: {
      kind: 'line_group',
      lineGroupId: 'group-1',
      lineUserId: 'user-1',
      lineDisplayName: 'Lane User',
      messageId: 'msg-1',
      messageText: 'Tokyo Tower',
      sourceUrl: undefined,
    },
  })
})

it('replies duplicate when the candidate already exists', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
  const { searchPlace } = require('@/app/actions/places') as typeof import('@/app/actions/places')
  const { addCandidateFromLine } = require('@/lib/candidates') as typeof import('@/lib/candidates')
  const { LINE_MESSAGES } = require('@/lib/line/messages') as typeof import('@/lib/line/messages')
  const place = makePlace({ name: 'Sushi Place' })

  ;(getActiveLineGroupBinding as jest.Mock).mockResolvedValue({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  ;(searchPlace as jest.Mock).mockResolvedValue(place)
  ;(addCandidateFromLine as jest.Mock).mockResolvedValue('duplicate')

  const { processLineTextMessage } = loadIngest()

  await expect(processLineTextMessage(lineInput({ text: 'Sushi Place' }))).resolves.toEqual({
    reply: LINE_MESSAGES.duplicate('Sushi Place'),
    status: 'done',
  })
})

it('scrapes article URLs, extracts places, verifies them, and replies with added count', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
  const { scrapeText } = require('@/app/actions/scrape') as typeof import('@/app/actions/scrape')
  const { extractItinerary } = require('@/app/actions/ai') as typeof import('@/app/actions/ai')
  const { verifyPlace } = require('@/app/actions/places') as typeof import('@/app/actions/places')
  const { addCandidateFromLine } = require('@/lib/candidates') as typeof import('@/lib/candidates')
  const { LINE_MESSAGES } = require('@/lib/line/messages') as typeof import('@/lib/line/messages')

  ;(getActiveLineGroupBinding as jest.Mock).mockResolvedValue({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  ;(scrapeText as jest.Mock).mockResolvedValue('article text')
  ;(extractItinerary as jest.Mock).mockResolvedValue({
    country: 'Japan',
    countryCode: 'jp',
    places: [
      { name: 'Tokyo Tower', type: 'attraction' },
      { name: 'Sushi Place', type: 'restaurant' },
    ],
  } satisfies ExtractedItinerary)
  ;(verifyPlace as jest.Mock)
    .mockResolvedValueOnce({
      placeId: 'place-1',
      lat: 35.6586,
      lng: 139.7454,
      localizedName: { zhTw: '東京鐵塔', original: 'Tokyo Tower' },
      localizedAddress: { zhTw: '東京', original: 'Tokyo' },
    })
    .mockResolvedValueOnce({
      placeId: 'place-2',
      lat: 35.689,
      lng: 139.692,
      localizedName: { zhTw: '壽司店', original: 'Sushi Place' },
      localizedAddress: { zhTw: '東京', original: 'Tokyo' },
    })
  ;(addCandidateFromLine as jest.Mock)
    .mockResolvedValueOnce('added')
    .mockResolvedValueOnce('added')

  const { processLineTextMessage } = loadIngest()

  await expect(
    processLineTextMessage(lineInput({ text: 'https://example.com/article' })),
  ).resolves.toEqual({
    reply: LINE_MESSAGES.addedMany(2),
    status: 'done',
  })

  expect(scrapeText).toHaveBeenCalledWith('https://example.com/article')
  expect(verifyPlace).toHaveBeenNthCalledWith(1, 'Tokyo Tower')
  expect(verifyPlace).toHaveBeenNthCalledWith(2, 'Sushi Place')
  expect(addCandidateFromLine).toHaveBeenCalledTimes(2)
  expect(addCandidateFromLine).toHaveBeenNthCalledWith(1, expect.objectContaining({
    place: expect.objectContaining({
      name: '東京鐵塔',
      localizedName: { zhTw: '東京鐵塔', original: 'Tokyo Tower' },
      localizedAddress: { zhTw: '東京', original: 'Tokyo' },
    }),
  }))
  expect(addCandidateFromLine).toHaveBeenNthCalledWith(2, expect.objectContaining({
    place: expect.objectContaining({
      name: '壽司店',
      localizedName: { zhTw: '壽司店', original: 'Sushi Place' },
      localizedAddress: { zhTw: '東京', original: 'Tokyo' },
    }),
  }))
})

it('returns noPlaceFound when no place can be resolved', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
  const { searchPlace } = require('@/app/actions/places') as typeof import('@/app/actions/places')
  const { LINE_MESSAGES } = require('@/lib/line/messages') as typeof import('@/lib/line/messages')

  ;(getActiveLineGroupBinding as jest.Mock).mockResolvedValue({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  ;(searchPlace as jest.Mock).mockResolvedValue(null)

  const { processLineTextMessage } = loadIngest()

  await expect(processLineTextMessage(lineInput({ text: 'Unknown Cafe' }))).resolves.toEqual({
    reply: LINE_MESSAGES.noPlaceFound,
    status: 'done',
  })
})

it('returns failed with articleFailed when article scraping fails', async () => {
  const { getActiveLineGroupBinding } = require('@/lib/line/bindings') as typeof import('@/lib/line/bindings')
  const { scrapeText } = require('@/app/actions/scrape') as typeof import('@/app/actions/scrape')
  const { LINE_MESSAGES } = require('@/lib/line/messages') as typeof import('@/lib/line/messages')

  ;(getActiveLineGroupBinding as jest.Mock).mockResolvedValue({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  ;(scrapeText as jest.Mock).mockResolvedValue(null)

  const { processLineTextMessage } = loadIngest()

  await expect(
    processLineTextMessage(lineInput({ text: 'https://example.com/broken-article' })),
  ).resolves.toEqual({
    reply: LINE_MESSAGES.articleFailed,
    status: 'failed',
  })
})
