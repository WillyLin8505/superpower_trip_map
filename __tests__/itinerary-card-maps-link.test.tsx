/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
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
  placeId: 'ChIJ-abc123',
  name: '台北101',
  type: 'attraction',
  lat: 25.03,
  lng: 121.56,
  address: '台北市信義區',
  openingHours: null,
  rating: null,
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

it('shows a link to open the place in Google Maps with the correct href', () => {
  render(<ItineraryCard place={basePlace} index={0} dateIso="2026-07-12" />)
  const link = screen.getByRole('link', { name: '在 Google Maps 開啟' })
  expect(link).toHaveAttribute('href', expect.stringContaining('query_place_id=ChIJ-abc123'))
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
})

it('does not interfere with existing archive/delete buttons', () => {
  const onArchive = jest.fn()
  const onDeletePlace = jest.fn()
  render(
    <ItineraryCard
      place={basePlace}
      index={0}
      dateIso="2026-07-12"
      onArchive={onArchive}
      onDeletePlace={onDeletePlace}
    />
  )
  expect(screen.getByRole('button', { name: '封存' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '刪除地點' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '在 Google Maps 開啟' })).toBeInTheDocument()
})
