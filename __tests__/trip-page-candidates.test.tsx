const getTrip = jest.fn()
const listMembers = jest.fn()
const listCandidates = jest.fn()
jest.mock('@/app/actions/trips', () => ({ getTrip: (...a: unknown[]) => getTrip(...a) }))
jest.mock('@/app/actions/members', () => ({ listMembers: (...a: unknown[]) => listMembers(...a) }))
jest.mock('@/app/actions/candidates', () => ({ listCandidates: (...a: unknown[]) => listCandidates(...a) }))
const getUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({ createClient: () => ({ auth: { getUser: () => getUser() } }) }))
jest.mock('next/navigation', () => ({ notFound: () => { throw new Error('NF') } }))
jest.mock('@/app/itinerary/ItineraryClient', () => ({ ItineraryClient: (p: { initialCandidates?: unknown }) => null && p }))
jest.mock('@/components/MembersPanel', () => ({ MembersPanel: () => null }))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' }
beforeEach(() => { getTrip.mockReset(); listMembers.mockReset(); listCandidates.mockReset(); getUser.mockReset() })

it('passes listCandidates result as initialCandidates', async () => {
  getTrip.mockResolvedValue({ plan, title: 'T', ownerId: 'u1' })
  listMembers.mockResolvedValue([])
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  const cands = [{ id: 'c1', place: { name: 'A' }, addedBy: 'u1', addedByName: '你' }]
  listCandidates.mockResolvedValue(cands)
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 't1' } })
  const json = JSON.stringify(el)
  expect(listCandidates).toHaveBeenCalledWith('t1')
  expect(json).toContain('"initialCandidates"')
  expect(json).toContain('"addedByName":"你"')
})
