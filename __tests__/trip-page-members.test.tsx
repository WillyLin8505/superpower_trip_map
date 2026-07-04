// TDD: verifies MembersPanel is mounted on the trip page with correct isOwner + members.

const getTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({ getTrip: (...a: unknown[]) => getTrip(...a) }))

const listMembers = jest.fn()
jest.mock('@/app/actions/members', () => ({ listMembers: (...a: unknown[]) => listMembers(...a) }))

const getUser = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: () => getUser() } }),
}))

const notFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND') })
jest.mock('next/navigation', () => ({ notFound: () => notFound() }))

jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: (props: { tripId?: string; initial?: unknown }) => null && props,
}))

jest.mock('@/components/MembersPanel', () => ({
  MembersPanel: (props: { tripId?: string; members?: unknown[]; isOwner?: boolean }) => null && props,
}))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' }
const members = [{ userId: 'u1', name: 'Alice', avatarUrl: null, role: 'owner', isSelf: true }]

beforeEach(() => {
  getTrip.mockReset()
  listMembers.mockReset()
  getUser.mockReset()
  notFound.mockClear()
})

it('passes isOwner=true when user.id matches trip ownerId', async () => {
  getTrip.mockResolvedValue({ plan, title: '東京', ownerId: 'owner-1' })
  listMembers.mockResolvedValue(members)
  getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } })
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 'trip-1' } })
  const [membersPanelEl] = el.props.children
  expect(membersPanelEl.props.isOwner).toBe(true)
})

it('passes isOwner=false when user.id differs from trip ownerId', async () => {
  getTrip.mockResolvedValue({ plan, title: '東京', ownerId: 'owner-1' })
  listMembers.mockResolvedValue(members)
  getUser.mockResolvedValue({ data: { user: { id: 'other-user' } } })
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 'trip-1' } })
  const [membersPanelEl] = el.props.children
  expect(membersPanelEl.props.isOwner).toBe(false)
})

it('calls listMembers with the tripId', async () => {
  getTrip.mockResolvedValue({ plan, title: '東京', ownerId: 'owner-1' })
  listMembers.mockResolvedValue(members)
  getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } })
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  await TripPage({ params: { tripId: 'trip-2' } })
  expect(listMembers).toHaveBeenCalledWith('trip-2')
})
