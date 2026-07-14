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

import { ItineraryCard } from '@/components/ItineraryCard'

const place: ScheduledPlace = {
  id: 'p1',
  placeId: 'ChIJ_yushan_shrine',
  name: '玉山祠',
  type: 'attraction',
  lat: 21.0287,
  lng: 105.852,
  address: 'Hanoi, Vietnam',
  openingHours: null,
  rating: null,
  photoUrl: null,
  description: null,
  startTime: '09:00',
  durationMin: 90,
  travelMinToNext: null,
  aiDescription: null,
  outsideHours: false,
  lateExit: false,
  startLocked: false,
  durationLocked: false,
}

it('links itinerary card titles to Google Maps', () => {
  // Regression: itinerary cards showed plain text titles instead of Google Maps links.
  // Found by /qa on 2026-07-14.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
  render(<ItineraryCard place={place} index={0} dateIso="2026-07-14" />)

  const link = screen.getByRole('link', { name: '玉山祠' })
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  expect(link).toHaveAttribute('href', expect.stringContaining('https://www.google.com/maps/search/'))
  expect(link).toHaveAttribute('href', expect.stringContaining('query_place_id=ChIJ_yushan_shrine'))
})
