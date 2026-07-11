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
  getHoursForDate: jest.fn(() => null),
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

it('renders three time facets and editable duration', () => {
  const onTimeChange = jest.fn()
  render(
    <ItineraryCard place={BASE} index={0} dateIso="2026-06-30" onTimeChange={onTimeChange} />
  )

  expect(screen.getByText('開始')).toBeInTheDocument()
  expect(screen.getByText('停留')).toBeInTheDocument()
  expect(screen.getByText('結束')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '停留分鐘' })).toHaveValue(90)
  expect(screen.getByRole('button', { name: '10:30' })).toBeInTheDocument()

  fireEvent.change(screen.getByRole('spinbutton', { name: '停留分鐘' }), { target: { value: '120' } })
  expect(onTimeChange).toHaveBeenCalledWith('p1', 'durationMin', 120)
})

it('renders three lock buttons when handlers provided', () => {
  render(
    <ItineraryCard place={BASE} index={0} dateIso="2026-06-30"
      onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} onToggleEndLock={jest.fn()} />
  )
  expect(screen.getByRole('button', { name: '鎖定開始時間' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '鎖定停留時間' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '鎖定結束時間' })).toBeInTheDocument()
})

it('clicking lock buttons calls their handlers', () => {
  const onStart = jest.fn(); const onDur = jest.fn(); const onEnd = jest.fn()
  render(
    <ItineraryCard
      place={BASE}
      index={0}
      dateIso="2026-06-30"
      onToggleStartLock={onStart}
      onToggleDurationLock={onDur}
      onToggleEndLock={onEnd}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: '鎖定開始時間' }))
  fireEvent.click(screen.getByRole('button', { name: '鎖定停留時間' }))
  fireEvent.click(screen.getByRole('button', { name: '鎖定結束時間' }))
  expect(onStart).toHaveBeenCalledWith('p1')
  expect(onDur).toHaveBeenCalledWith('p1')
  expect(onEnd).toHaveBeenCalledWith('p1')
})

it('disables the derived third lock when two time facets are locked', () => {
  render(
    <ItineraryCard
      place={{ ...BASE, startLocked: true, durationLocked: true, endLocked: false }}
      index={0}
      dateIso="2026-06-30"
      onToggleStartLock={jest.fn()}
      onToggleDurationLock={jest.fn()}
      onToggleEndLock={jest.fn()}
    />
  )

  expect(screen.getByRole('button', { name: '解鎖開始時間' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '解鎖停留時間' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '解鎖結束時間' })).toBeDisabled()
})

it('startLocked → start time static (no start picker) but drag handle still shown (drag decoupled from locks)', () => {
  render(
    <ItineraryCard place={{ ...BASE, startLocked: true }} index={0} dateIso="2026-06-30" draggable
      onTimeChange={jest.fn()} onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} onToggleEndLock={jest.fn()} />
  )
  // aria-label flips to 解鎖開始時間 when locked
  expect(screen.getByRole('button', { name: '解鎖開始時間' })).toBeInTheDocument()
  expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  // start shown as static text 09:00 (no picker button for 09:00)
  expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
})

it('durationLocked → end time static but start still editable; card still draggable', () => {
  render(
    <ItineraryCard place={{ ...BASE, durationLocked: true }} index={0} dateIso="2026-06-30" draggable
      onTimeChange={jest.fn()} onToggleStartLock={jest.fn()} onToggleDurationLock={jest.fn()} onToggleEndLock={jest.fn()} />
  )
  expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  // start picker present (09:00 button), end is static (10:30 not a button)
  expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '10:30' })).not.toBeInTheDocument()
})
