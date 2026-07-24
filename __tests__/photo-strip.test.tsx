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

  it('refreshes full legacy photo sets when requested', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photoUrls: [
          'https://images.example/free-1.jpg',
          'https://images.example/free-2.jpg',
          'https://images.example/free-3.jpg',
          'https://images.example/free-4.jpg',
          'https://images.example/free-5.jpg',
        ],
      }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Stale Place"
        photos={[
          'https://stale.example/old-1.jpg',
          'https://stale.example/old-2.jpg',
          'https://stale.example/old-3.jpg',
          'https://stale.example/old-4.jpg',
          'https://stale.example/old-5.jpg',
        ]}
        eagerAutoFetch
        refreshFetchedPhotos
      />
    )

    await waitFor(() => expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', 'https://images.example/free-1.jpg'))
    expect(screen.getByTestId('photo-thumb-4').querySelector('img')).toHaveAttribute('src', 'https://images.example/free-5.jpg')
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Stale+Place&v=15`)
  })

  it('replaces stale full photo sets even when refreshed results have fewer than five photos', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photoUrls: [
          'https://images.example/current-1.jpg',
          'https://images.example/current-2.jpg',
        ],
      }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Short Fresh Place"
        photos={[
          'https://stale.example/old-1.jpg',
          'https://stale.example/old-2.jpg',
          'https://stale.example/old-3.jpg',
          'https://stale.example/old-4.jpg',
          'https://stale.example/old-5.jpg',
        ]}
        eagerAutoFetch
        refreshFetchedPhotos
      />
    )

    await waitFor(() => expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', 'https://images.example/current-1.jpg'))
    expect(screen.getByTestId('photo-thumb-1').querySelector('img')).toHaveAttribute('src', 'https://images.example/current-2.jpg')
    expect(screen.queryByTestId('photo-thumb-2')).not.toBeInTheDocument()
  })

  it('clears stale refreshed photo sets when the current resolver has no photos', async () => {
    const onPhotoUnavailable = jest.fn()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: [] }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="No Current Photo Place"
        photos={['https://stale.example/old-1.jpg']}
        eagerAutoFetch
        refreshFetchedPhotos
        onPhotoUnavailable={onPhotoUnavailable}
      />
    )

    await waitFor(() => expect(screen.queryByTestId('photo-thumb-0')).not.toBeInTheDocument())
    expect(onPhotoUnavailable).toHaveBeenCalledTimes(1)
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

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Avoccino&v=15`))
    expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('photo-thumb-0'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('photo-next'))
    await waitFor(() => expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=two'))
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not fetch more photos in cover mode when one stored cover already exists', () => {
    global.fetch = jest.fn() as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Avoccino"
        photos={['/api/photo?ref=one']}
        previewCount={1}
        autoFetchKind="cover"
      />
    )

    expect(screen.getAllByTestId(/^photo-thumb-/)).toHaveLength(1)
    expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=one')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('tries free photo lookup before showing deferred Google photo media', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photoUrls: [
          'https://free.example/one.jpg',
          'https://free.example/two.jpg',
          'https://free.example/three.jpg',
          'https://free.example/four.jpg',
          'https://free.example/five.jpg',
        ],
      }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Avoccino"
        photos={['/api/photo?ref=paid-google']}
        previewCount={5}
        autoFetchKind="all"
        deferGooglePhotoMedia
      />
    )

    expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()
    expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', 'https://free.example/one.jpg')
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Avoccino&v=15`)
  })

  it('does not auto-load stored Google photo media when cover mode defers paid photos', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: ['https://free.example/cover.jpg'] }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Train Street"
        photos={['/api/photo?ref=paid-google-cover']}
        previewCount={1}
        autoFetchKind="cover"
        deferGooglePhotoMedia
      />
    )

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    const coverImg = screen.getByTestId('photo-thumb-0').querySelector('img')
    expect(coverImg).toHaveAttribute('src', 'https://free.example/cover.jpg')
    expect(coverImg).not.toHaveAttribute('src', '/api/photo?ref=paid-google-cover')
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Train+Street&v=15&limit=1`)
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
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Avoccino&v=15`)
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
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Avoccino&v=15`)
  })

  it('observes stored cover-photo cards before fetching the remaining photos', async () => {
    window.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
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

    render(<PhotoStrip placeId={googlePlaceId} placeName="Train Street" photos={['/api/photo?ref=one']} />)

    expect(screen.getByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(MockIntersectionObserver.instances).toHaveLength(1)
    expect(MockIntersectionObserver.instances[0].observe).toHaveBeenCalledWith(expect.any(HTMLElement))

    MockIntersectionObserver.instances[0].intersect()

    expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Train+Street&v=15`)
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
    expect(global.fetch).toHaveBeenCalledWith('/api/place-photos?placeId=osm%3A123&placeName=Train+Street&v=15')
  })

  it('ignores stale v1 cached cover photos so old generic images are not reused', async () => {
    window.sessionStorage.setItem(`photo-strip:v4:cover:${googlePlaceId}`, JSON.stringify(['/api/photo?ref=stale-generic']))
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: ['/api/photo?ref=fresh-place-photo'] }),
    }) as unknown as typeof fetch

    render(<PhotoStrip placeId={googlePlaceId} placeName="Fresh Place" photos={[]} />)

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', '/api/photo?ref=fresh-place-photo')
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Fresh+Place&v=15`)
  })

  it('refetches stale one-photo all caches instead of reusing incomplete results', async () => {
    window.sessionStorage.setItem(`photo-strip:v7:all:${googlePlaceId}`, JSON.stringify(['/api/photo?ref=one']))
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

    render(<PhotoStrip placeId={googlePlaceId} placeName="Train Street" photos={['/api/photo?ref=one']} />)

    expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Train+Street&v=15`)
  })

  it('filters broken Openverse thumb proxy URLs from incoming photos', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        photoUrls: [
          'https://images.example/replacement-1.jpg',
          'https://images.example/replacement-2.jpg',
          'https://images.example/replacement-3.jpg',
          'https://images.example/replacement-4.jpg',
          'https://images.example/replacement-5.jpg',
        ],
      }),
    }) as unknown as typeof fetch

    render(
      <PhotoStrip
        placeId={googlePlaceId}
        placeName="Croissent"
        photos={['https://api.openverse.org/v1/images/118284db-3f7c-4cf9-a93d-9d826d3cacbf/thumb/']}
      />
    )

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', 'https://images.example/replacement-1.jpg')
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Croissent&v=15`)
  })

  it('does not show a gray placeholder or fetch Google photos for short local ids', () => {
    global.fetch = jest.fn() as unknown as typeof fetch

    render(<PhotoStrip placeId="place-1" placeName="Local Fixture" photos={[]} />)

    expect(screen.queryByTestId('photo-placeholder')).not.toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does not auto-fetch missing Google photos when autoFetch is disabled', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: ['/api/photo?ref=manual'] }),
    }) as unknown as typeof fetch

    render(<PhotoStrip placeId={googlePlaceId} placeName="Manual Place" photos={[]} autoFetch={false} />)

    expect(screen.queryByTestId('photo-placeholder')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '載入照片' })).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '載入照片' }))

    expect(await screen.findByTestId('photo-thumb-0')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledWith(`/api/place-photos?placeId=${googlePlaceId}&placeName=Manual+Place&v=15`)
  })

  it('hides the gray placeholder when a missing-photo fetch returns no photos', async () => {
    const onPhotoUnavailable = jest.fn()
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoUrls: [] }),
    }) as unknown as typeof fetch

    render(<PhotoStrip placeId={googlePlaceId} placeName="No Photo Place" photos={[]} onPhotoUnavailable={onPhotoUnavailable} />)

    expect(screen.getByTestId('photo-placeholder')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('photo-placeholder')).not.toBeInTheDocument())
    expect(screen.queryByTestId('photo-thumb-0')).not.toBeInTheDocument()
    expect(onPhotoUnavailable).toHaveBeenCalledTimes(1)
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
