const getTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({ getTrip: (...a: unknown[]) => getTrip(...a) }))
const notFound = jest.fn(() => { throw new Error('NEXT_NOT_FOUND') })
jest.mock('next/navigation', () => ({ notFound: () => notFound() }))
jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: (props: { tripId?: string; initial?: unknown }) => null && props,
}))

const plan = { days: [], transportMode: 'driving', startDate: '2026-07-04' }

beforeEach(() => { getTrip.mockReset(); notFound.mockClear() })

it('calls notFound when trip is missing', async () => {
  getTrip.mockResolvedValue(null)
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  await expect(TripPage({ params: { tripId: 'x' } })).rejects.toThrow('NEXT_NOT_FOUND')
})

it('renders ItineraryClient with tripId + plan when found', async () => {
  getTrip.mockResolvedValue({ plan, title: '東京' })
  const TripPage = require('@/app/itinerary/[tripId]/page').default
  const el = await TripPage({ params: { tripId: 't1' } })
  expect(el.props.tripId).toBe('t1')
  expect(el.props.initial).toEqual(plan)
})
