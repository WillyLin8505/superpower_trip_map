const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})

jest.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}))

jest.mock('@/app/itinerary/ItineraryClient', () => ({
  ItineraryClient: () => null,
}))

describe('/test-drag route guard', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalVercelEnv = process.env.VERCEL_ENV

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: originalNodeEnv,
      configurable: true,
      writable: true,
    })
    if (originalVercelEnv === undefined) {
      delete process.env.VERCEL_ENV
    } else {
      process.env.VERCEL_ENV = originalVercelEnv
    }
    jest.resetModules()
    mockNotFound.mockClear()
  })

  it('returns 404 in Vercel production', () => {
    process.env.VERCEL_ENV = 'production'

    const TestDragPage = require('@/app/test-drag/page').default

    expect(() => TestDragPage()).toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalledTimes(1)
  })
})
