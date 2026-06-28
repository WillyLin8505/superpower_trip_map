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
  TimeScrollPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange(value)}>{value}</button>
  ),
}))

import { ItineraryCard } from '@/components/ItineraryCard'

const BASE: ScheduledPlace = {
  id: 'p1', placeId: 'g1', name: '某飯店', type: 'attraction',
  lat: 0, lng: 0, address: '地址', openingHours: null, rating: null,
  photoUrl: null, description: null, startTime: '09:00', durationMin: 90,
  travelMinToNext: null, aiDescription: null, outsideHours: false,
  lateExit: false, startLocked: false, durationLocked: false,
}

it('renders accommodation card with purple background', () => {
  render(<ItineraryCard place={{ ...BASE, type: 'accommodation' }} index={0} dateIso="2026-06-30" />)
  expect(screen.getByTestId('card-p1').className).toContain('bg-purple-50')
})

it('clicking the badge and picking a type calls onChangeType with the selected type', () => {
  const onChangeType = jest.fn()
  render(<ItineraryCard place={BASE} index={0} dateIso="2026-06-30" onChangeType={onChangeType} />)
  fireEvent.click(screen.getByRole('button', { name: /景點/ }))
  fireEvent.click(screen.getByText('🏨 住宿'))
  expect(onChangeType).toHaveBeenCalledWith('p1', 'accommodation')
})

it('shows a static badge (no picker) when onChangeType is absent', () => {
  render(<ItineraryCard place={BASE} index={0} dateIso="2026-06-30" />)
  // static label present, but no ▾ trigger
  expect(screen.getByText('景點')).toBeInTheDocument()
  expect(screen.queryByText(/▾/)).not.toBeInTheDocument()
})
