/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
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
  getTodayHours: jest.fn(() => null),
}))
jest.mock('@/components/TimeScrollPicker', () => ({
  TimeScrollPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange(value)}>{value}</button>
  ),
}))

const BASE: ScheduledPlace = {
  id: 'p1', placeId: 'g1', name: '淺草寺', type: 'attraction',
  lat: 0, lng: 0, address: '東京', openingHours: null, rating: null,
  photoUrl: null, description: null, startTime: '09:00', durationMin: 90,
  travelMinToNext: null, aiDescription: null, outsideHours: false,
  lateExit: false, startLocked: false, durationLocked: false,
}

it('renders two lock buttons (start + duration) when handlers provided', () => {
  render(
    <ItineraryCard place={BASE} index={0}
      onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} />
  )
  expect(screen.getByRole('button', { name: '鎖定開始時間' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '鎖定停留時間' })).toBeInTheDocument()
})

it('clicking start lock calls onToggleStartLock; duration lock calls onToggleDurationLock', () => {
  const onStart = jest.fn(); const onDur = jest.fn()
  render(<ItineraryCard place={BASE} index={0} onToggleStartLock={onStart} onToggleDurationLock={onDur} />)
  fireEvent.click(screen.getByRole('button', { name: '鎖定開始時間' }))
  fireEvent.click(screen.getByRole('button', { name: '鎖定停留時間' }))
  expect(onStart).toHaveBeenCalledWith('p1')
  expect(onDur).toHaveBeenCalledWith('p1')
})

it('startLocked → start time static (no start picker) and no drag handle', () => {
  render(
    <ItineraryCard place={{ ...BASE, startLocked: true }} index={0} draggable
      onTimeChange={jest.fn()} onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} />
  )
  // aria-label flips to 解鎖開始時間 when locked
  expect(screen.getByRole('button', { name: '解鎖開始時間' })).toBeInTheDocument()
  expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument()
  // start shown as static text 09:00 (no picker button for 09:00)
  expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
})

it('durationLocked → end time static but start still editable; card still draggable', () => {
  render(
    <ItineraryCard place={{ ...BASE, durationLocked: true }} index={0} draggable
      onTimeChange={jest.fn()} onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} />
  )
  expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  // start picker present (09:00 button), end is static (10:30 not a button)
  expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '10:30' })).not.toBeInTheDocument()
})
