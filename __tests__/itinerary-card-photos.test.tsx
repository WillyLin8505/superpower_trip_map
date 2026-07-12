/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import type { ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
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

it('shows multiple place photos and opens the clicked photo', () => {
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

  expect(screen.getByRole('button', { name: '檢視 Avoccino 照片 1' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '檢視 Avoccino 照片 4' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByAltText('Avoccino 照片 4')).toHaveAttribute('src', '/api/photo?ref=four')
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

  expect(screen.getByRole('button', { name: '檢視 Avoccino 照片 1' })).toBeInTheDocument()
})
