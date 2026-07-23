/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ScheduledPlace } from '@/lib/types'

let sortableIsDragging = false

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: sortableIsDragging,
  }),
}))

jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

jest.mock('@/lib/utils/hours', () => ({
  getHoursForDate: jest.fn(() => null),
}))

jest.mock('@/components/TimeScrollPicker', () => ({
  TimeScrollPicker: ({ value }: { value: string }) => <span>{value}</span>,
}))

import { ItineraryCard } from '@/components/ItineraryCard'

const realFetch = global.fetch

const basePlace: ScheduledPlace = {
  id: 'id-1',
  placeId: 'ChIJtokyoPlace1234567890',
  name: 'Avoccino',
  type: 'dessert',
  lat: 21.03,
  lng: 105.84,
  address: 'Hanoi',
  openingHours: null,
  rating: 4.9,
  photoUrl: null,
  description: null,
  startTime: '09:00',
  durationMin: 60,
  travelMinToNext: null,
  aiDescription: null,
  outsideHours: false,
  lateExit: false,
  startLocked: false,
  durationLocked: false,
}

beforeEach(() => {
  sortableIsDragging = false
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      photoUrls: [
        'https://images.example/tokyo-free-1.jpg',
        'https://images.example/tokyo-free-2.jpg',
        'https://images.example/tokyo-free-3.jpg',
        'https://images.example/tokyo-free-4.jpg',
        'https://images.example/tokyo-free-5.jpg',
      ],
    }),
  }) as unknown as typeof fetch
})

afterEach(() => {
  global.fetch = realFetch
  jest.restoreAllMocks()
})

it('shows available thumbnails and previews photos from the lightbox', async () => {
  render(
    <ItineraryCard
      place={{
        ...basePlace,
        photoUrl: '/api/photo?ref=one',
        photoUrls: [
          '/api/photo?ref=one',
          '/api/photo?ref=two',
          '/api/photo?ref=three',
          '/api/photo?ref=four',
        ],
      }}
      index={0}
      dateIso="2026-07-12"
    />
  )

  // Photos auto-load with no '載入照片' gate and preview up to 5 thumbnails.
  expect(screen.queryByRole('button', { name: '載入照片' })).not.toBeInTheDocument()
  expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()
  expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', 'https://images.example/tokyo-free-1.jpg')
  const [requestUrl] = (global.fetch as jest.Mock).mock.calls[0]
  const params = new URL(String(requestUrl), 'http://localhost').searchParams
  expect(params.get('placeId')).toBe('ChIJtokyoPlace1234567890')
  expect(params.get('placeName')).toBe('Avoccino')
  expect(params.get('placeType')).toBe('dessert')
  expect(params.get('lat')).toBe('21.03')
  expect(params.get('lng')).toBe('105.84')
  fireEvent.click(screen.getByTestId('photo-thumb-0'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('photo-next'))
  await waitFor(() => expect(screen.getByAltText('Avoccino 照片 2')).toHaveAttribute('src', 'https://images.example/tokyo-free-2.jpg'))
  fireEvent.click(screen.getByTestId('photo-next'))
  await waitFor(() => expect(screen.getByAltText('Avoccino 照片 3')).toHaveAttribute('src', 'https://images.example/tokyo-free-3.jpg'))
  fireEvent.click(screen.getByTestId('photo-next'))
  await waitFor(() => expect(screen.getByAltText('Avoccino 照片 4')).toHaveAttribute('src', 'https://images.example/tokyo-free-4.jpg'))
})

it('replaces legacy single Google photoUrl with auto-fetched free photos', async () => {
  render(
    <ItineraryCard
      place={{
        ...basePlace,
        photoUrl: '/api/photo?ref=legacy',
      }}
      index={0}
      dateIso="2026-07-12"
    />
  )

  // Legacy single Google photoUrl is replaced by free photos without a load gate.
  expect(screen.queryByRole('button', { name: '載入照片' })).not.toBeInTheDocument()
  expect(await screen.findByTestId('photo-thumb-4')).toBeInTheDocument()
  expect(screen.getByTestId('photo-thumb-0').querySelector('img')).toHaveAttribute('src', 'https://images.example/tokyo-free-1.jpg')
})

it('collapses to title and type badge while the card is being dragged', () => {
  sortableIsDragging = true

  render(
    <ItineraryCard
      place={{
        ...basePlace,
        photoUrl: '/api/photo?ref=one',
        description: '咖啡甜點店',
      }}
      index={0}
      dateIso="2026-07-12"
      draggable
    />
  )

  expect(screen.getByRole('heading', { name: 'Avoccino' })).toBeInTheDocument()
  expect(screen.getByText('甜點')).toBeInTheDocument()
  expect(screen.queryByTestId('photo-thumb-0')).not.toBeInTheDocument()
  expect(screen.queryByText('09:00')).not.toBeInTheDocument()
  expect(screen.queryByText(/評分/)).not.toBeInTheDocument()
  expect(screen.queryByText('咖啡甜點店')).not.toBeInTheDocument()
})

it('supports an explicit compact preview for the drag overlay', () => {
  render(
    <ItineraryCard
      {...({ compact: true } as { compact: boolean })}
      place={{
        ...basePlace,
        photoUrl: '/api/photo?ref=one',
        description: '咖啡甜點店',
      }}
      index={0}
      dateIso="2026-07-12"
    />
  )

  expect(screen.getByRole('heading', { name: 'Avoccino' })).toBeInTheDocument()
  expect(screen.getByText('甜點')).toBeInTheDocument()
  expect(screen.queryByTestId('photo-thumb-0')).not.toBeInTheDocument()
  expect(screen.queryByText('09:00')).not.toBeInTheDocument()
})
