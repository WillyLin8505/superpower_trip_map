/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import type { ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: jest.fn(), transform: null, transition: null, isDragging: false }),
}))
jest.mock('@dnd-kit/utilities', () => ({ CSS: { Transform: { toString: () => '' } } }))
jest.mock('@/lib/utils/hours', () => ({ getHoursForDate: jest.fn(() => null) }))
jest.mock('@/components/TimeScrollPicker', () => ({ TimeScrollPicker: ({ value }: { value: string }) => <span>{value}</span> }))

import { ItineraryCard } from '@/components/ItineraryCard'

const basePlace: ScheduledPlace = {
  id: 'id-1', placeId: 'pid-1', name: '道頓堀', type: 'attraction', lat: 34.66, lng: 135.5,
  address: 'Osaka', openingHours: null, rating: null, photoUrl: null, description: null,
  startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
  outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
}

test('shows a geo-outlier warning when isGeoOutlier is true', () => {
  render(<ItineraryCard place={basePlace} index={0} dateIso="2026-10-07" isGeoOutlier />)
  expect(screen.getByText(/離當天其他行程很遠/)).toBeInTheDocument()
})

test('no geo-outlier warning by default', () => {
  render(<ItineraryCard place={basePlace} index={0} dateIso="2026-10-07" />)
  expect(screen.queryByText(/離當天其他行程很遠/)).not.toBeInTheDocument()
})
