const getSharedTrip = jest.fn()
jest.mock('@/app/actions/share', () => ({ getSharedTrip: (...a: unknown[]) => getSharedTrip(...a) }))

const notFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND') })
jest.mock('next/navigation', () => ({ notFound: () => notFound() }))

jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: (props: Record<string, unknown>) => null && props,
}))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' }

function childrenOf(el: { props: { children: unknown } }) {
  return (Array.isArray(el.props.children) ? el.props.children : [el.props.children]).filter(Boolean) as Array<{ props: Record<string, unknown> }>
}

beforeEach(() => {
  getSharedTrip.mockReset()
  notFound.mockClear()
})

it('passes shared side-panel data into the itinerary client', async () => {
  const candidates = [{ id: 'line-1' }]
  const archived = [{ id: 'archive-1' }]
  const collectionRows = [{ id: 'saved-1' }]
  getSharedTrip.mockResolvedValue({
    tripId: 'trip-1',
    title: 'Shared trip',
    plan,
    linkAccess: 'view',
    canEdit: false,
    candidates,
    archived,
    collectionRows,
  })

  const SharePage = require('@/app/share/[token]/page').default
  const el = await SharePage({ params: Promise.resolve({ token: '5d7ec31d-5a31-4407-aa0a-a40195fc3f4f' }) })
  const itineraryEl = childrenOf(el).find((child) => child.props.initial)

  expect(getSharedTrip).toHaveBeenCalledWith('5d7ec31d-5a31-4407-aa0a-a40195fc3f4f')
  expect(itineraryEl?.props).toMatchObject({
    initial: plan,
    tripId: 'trip-1',
    shareToken: '5d7ec31d-5a31-4407-aa0a-a40195fc3f4f',
    canEdit: false,
    personalPanelsEnabled: true,
    initialCandidates: candidates,
    initialArchived: archived,
    initialCollectionRows: collectionRows,
  })
})

it('calls notFound for an invalid or unavailable share token', async () => {
  getSharedTrip.mockResolvedValue(null)
  const SharePage = require('@/app/share/[token]/page').default

  await expect(SharePage({ params: Promise.resolve({ token: 'missing' }) })).rejects.toThrow('NEXT_NOT_FOUND')
})
