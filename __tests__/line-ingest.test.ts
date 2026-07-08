import type { Place } from '@/lib/types'

const getActiveLineGroupBinding = jest.fn()
const searchPlace = jest.fn()
const scrapeText = jest.fn()
const extractItinerary = jest.fn()
const addCandidateFromLine = jest.fn()

jest.mock('@/lib/line/bindings', () => ({
  getActiveLineGroupBinding: (...args: unknown[]) => getActiveLineGroupBinding(...args),
}))
jest.mock('@/app/actions/places', () => ({
  searchPlace: (...args: unknown[]) => searchPlace(...args),
}))
jest.mock('@/app/actions/scrape', () => ({
  scrapeText: (...args: unknown[]) => scrapeText(...args),
}))
jest.mock('@/app/actions/ai', () => ({
  extractItinerary: (...args: unknown[]) => extractItinerary(...args),
}))
jest.mock('@/app/actions/candidates', () => ({
  addCandidateFromLine: (...args: unknown[]) => addCandidateFromLine(...args),
}))

const place: Place = {
  id: 'local-1',
  placeId: 'google-place-1',
  name: '?啣?101',
  type: 'attraction',
  lat: 25.033,
  lng: 121.565,
  address: '?啣?撣?',
  openingHours: null,
  rating: 4.7,
  photoUrl: null,
  description: null,
}

beforeEach(() => {
  jest.resetModules()
  getActiveLineGroupBinding.mockResolvedValue({
    lineGroupId: 'Cg123',
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
  })
  searchPlace.mockResolvedValue(place)
  scrapeText.mockResolvedValue('?啣?101 ??瘞詨熒銵?')
  extractItinerary.mockResolvedValue({
    country: 'Taiwan',
    countryCode: 'tw',
    places: [{ name: '?啣?101', type: 'attraction' }],
  })
  addCandidateFromLine.mockResolvedValue('added')
})

it('ignores unbound group without a reply', async () => {
  getActiveLineGroupBinding.mockResolvedValue(null)
  const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')

  await expect(processLineTextMessage({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '撠?',
    messageId: 'm1',
    text: '?啣?101',
  })).resolves.toEqual({ kind: 'ignored' })
})

it('adds plain text place to candidates', async () => {
  const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')

  await expect(processLineTextMessage({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    lineDisplayName: '撠?',
    messageId: 'm1',
    text: '?啣?101',
  })).resolves.toEqual({ kind: 'reply', text: '撌脣??亙瘙??啣?101' })

  expect(addCandidateFromLine).toHaveBeenCalledWith(expect.objectContaining({
    tripId: 'trip-1',
    writeAsUserId: 'owner-1',
    place,
    source: expect.objectContaining({
      kind: 'line_group',
      lineGroupId: 'Cg123',
      lineUserId: 'U123',
      lineDisplayName: '撠?',
      messageId: 'm1',
      messageText: '?啣?101',
    }),
  }))
})

it('extracts article URL into candidates', async () => {
  const { processLineTextMessage } = require('@/lib/line/ingest') as typeof import('@/lib/line/ingest')

  await expect(processLineTextMessage({
    lineGroupId: 'Cg123',
    lineUserId: 'U123',
    messageId: 'm2',
    text: 'https://travel.example.com/taipei',
  })).resolves.toEqual({ kind: 'reply', text: '撌脣??亙瘙??啣?101' })
})
