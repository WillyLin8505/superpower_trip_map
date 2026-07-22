const getTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({ getTrip: (...a: unknown[]) => getTrip(...a) }))

const listMembers = jest.fn()
jest.mock('@/app/actions/members', () => ({ listMembers: (...a: unknown[]) => listMembers(...a) }))
jest.mock('@/app/actions/candidates', () => ({ listCandidates: jest.fn().mockResolvedValue([]), listArchived: jest.fn().mockResolvedValue([]) }))

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

function childrenOf(el: { props: { children: unknown } }) {
  return (Array.isArray(el.props.children) ? el.props.children : [el.props.children]).filter(Boolean) as Array<{ props: Record<string, unknown> }>
}

beforeEach(() => {
  getTrip.mockReset()
  listMembers.mockReset()
  getUser.mockReset()
  notFound.mockClear()
})

it('calls notFound when trip is missing', async () => {
  getTrip.mockResolvedValue(null)
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  await expect(TripPage({ params: { tripId: 'x' } })).rejects.toThrow('NEXT_NOT_FOUND')
})

it('renders ItineraryClient with tripId + plan when found', async () => {
  getTrip.mockResolvedValue({ plan, title: '東京', ownerId: 'o1', role: 'editor' })
  listMembers.mockResolvedValue([])
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 't1' } })
  const itineraryEl = childrenOf(el).find((child) => child.props.initial)
  expect(itineraryEl.props.tripId).toBe('t1')
  expect(itineraryEl.props.initial).toEqual(plan)
  expect(itineraryEl.props.canEdit).toBe(true)
})
