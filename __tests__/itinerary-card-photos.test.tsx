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

const basePlace: ScheduledPlace = {
  id: 'id-1',
  placeId: 'pid-1',
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
})

it('shows a cover photo and previews additional photos from the lightbox', async () => {
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

  expect(screen.getByTestId('photo-thumb-0')).toBeInTheDocument()
  expect(screen.queryByTestId('photo-thumb-1')).toBeNull()
  fireEvent.click(screen.getByTestId('photo-thumb-0'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()

  fireEvent.click(screen.getByTestId('photo-next'))
  await waitFor(() => expect(screen.getByAltText('Avoccino 照片 2')).toHaveAttribute('src', '/api/photo?ref=two'))
  fireEvent.click(screen.getByTestId('photo-next'))
  await waitFor(() => expect(screen.getByAltText('Avoccino 照片 3')).toHaveAttribute('src', '/api/photo?ref=three'))
  fireEvent.click(screen.getByTestId('photo-next'))
  await waitFor(() => expect(screen.getByAltText('Avoccino 照片 4')).toHaveAttribute('src', '/api/photo?ref=four'))
})

it('falls back to legacy single photoUrl when photoUrls is absent', () => {
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

  expect(screen.getByTestId('photo-thumb-0')).toBeInTheDocument()
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
