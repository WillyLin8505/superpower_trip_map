/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PhotoStrip } from '@/components/PhotoStrip'

describe('PhotoStrip', () => {
  const googlePlaceId = 'ChIJtestplace1234567890'
  const realFetch = global.fetch
  const realIntersectionObserver = window.IntersectionObserver

  class MockIntersectionObserver {
    static instances: MockIntersectionObserver[] = []
    readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback
      MockIntersectionObserver.instances.push(this)
    }

    observe = jest.fn()
    unobserve = jest.fn()
    disconnect = jest.fn()

    intersect(isIntersecting = true) {
      this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
  }

  afterEach(() => {
    global.fetch = realFetch
    window.IntersectionObserver = realIntersectionObserver
    window.sessionStorage.clear()
    MockIntersectionObserver.instances = []
    jest.restoreAllMocks()
  })

  it('renders up to five stored thumbnails without fetching when already full', () => {
    global.fetch = jest.fn() as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Avoccino"
        photos={[
          '/api/photo?ref=one',
          '/api/photo?ref=two',
          '/api/photo?ref=three',
          '/api/photo?ref=four',
          '/api/photo?ref=five',
          '/api/photo?ref=six',
        ]}
      />
    )

    expect(screen.getAllByTestId(/^photo-thumb-/)).toHaveLength(5)
    expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=one')
    expect(screen.getByTestId('photo-thumb-4').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=five')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fills stored cover photos to five as soon as the card is eligible', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photoUrls: [
          '/api/photo?ref=one',
          '/api/photo?ref=two',
          '/api/photo?ref=three',
          '/api/photo?ref=four',
          '/api/photo?ref=five',
        ],
      }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Avoccino"
        photos={['/api/photo?ref=one']}
      />
    )

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Avoccino&v=2`))
    expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('photo-thumb-0'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('photo-next'))
    await waitFor(() => expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=two'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches up to five photos when no photo URL is already available', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photoUrls: [
          '/api/photo?ref=cover',
          '/api/photo?ref=extra',
          '/api/photo?ref=three',
          '/api/photo?ref=four',
          '/api/photo?ref=five',
        ],
      }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Avoccino"
        photos={[]}
      />
    )

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()
    const coverImg = screen.getByTestId('photo-thumb-0').querySelector('img')
    expect(coverImg).toHaveAttribute('src', '/api/photo?ref=cover')
    expect(coverImg).toHaveAttribute('loading', 'lazy')
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Avoccino&v=2`)
  })

  it('waits until the photo slot is near the viewport before fetching missing photos', async () => {
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: ['/api/photo?ref=cover'] }),
    }) as unknown as typeof fetch

    render(<PhotoStrip placeId={googlePlaceId} placeName="Avoccino" photos={[]} />)

    expect(screen.getByTestId('photo-placeholder')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()

    MockIntersectionObserver.instances[0].intersect()

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Avoccino&v=2`)
  })

  it('deduplicates simultaneous missing-photo requests for the same place', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: ['/api/photo?ref=cover'] }),
    }) as unknown as typeof fetch

    render(
      <>
        <PhotoStrip placeId={googlePlaceId} placeName="First" photos={[]} />
        <PhotoStrip placeId={googlePlaceId} placeName="Second" photos={[]} />
      </>
    )

    expect(await screen.findAllByTestId('photo-thumb-0')).toHaveLength(2)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('fetches up to five free photos for non-Google place ids by place name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: ['https://images.example/train-street.jpg'] }),
    }) as unknown as typeof fetch

    render(<PhotoStrip placeId="osm:123" placeName="Train Street" photos={[]} />)

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith('/api/place-photos?placeId=osm%3A123&placeName=Train+Street&v=2')
  })

  it('ignores stale v1 cached cover photos so old generic images are not reused', async () => {
    window.sessionStorage.setItem(`photo-strip:v1:cover:${googlePlaceId}`, JSON.stringify(['/api/photo?ref=stale-generic']))
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: ['/api/photo?ref=fresh-place-photo'] }),
    }) as unknown as typeof fetch

    render(<PhotoStrip placeId={googlePlaceId} placeName="Fresh Place" photos={[]} />)

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=fresh-place-photo')
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Fresh+Place&v=2`)
  })

  it('does not show a gray placeholder or fetch Google photos for short local ids', () => {
    global.fetch = jest.fn() as unknown as typeof fetch

    render(<PhotoStrip placeId="place-1" placeName="Local Fixture" photos={[]} />)

    expect(screen.queryByTestId('photo-placeholder')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('hides the gray placeholder when a missing-photo fetch returns no photos', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: [] }),
    }) as unknown as typeof fetch

    render(<PhotoStrip placeId={googlePlaceId} placeName="No Photo Place" photos={[]} />)

    expect(screen.getByTestId('photo-placeholder')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('photo-placeholder')).not.toBeInTheDocument())
    expect(screen.queryByTestId('photo-thumb-0')).not.toBeInTheDocument()
  })

  it('closes the lightbox with Escape', () => {
    render(
      <PhotoStrip
        placeName="Avoccino"
        photos={['/api/photo?ref=one']}
      />
    )

    fireEvent.click(screen.getByTestId('photo-thumb-0'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
