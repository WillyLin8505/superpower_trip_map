/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'

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
  id: 'p1',
  placeId: 'g1',
  name: '淺草寺',
  type: 'attraction',
  lat: 0,
  lng: 0,
  address: '東京',
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

it('renders three time facets: start, duration, and end', () => {
  render(<ItineraryCard place={BASE} index={0} dateIso="2026-06-30" onTimeChange={jest.fn()} />)

  expect(screen.getByText('開始')).toBeInTheDocument()
  expect(screen.getByText('停留')).toBeInTheDocument()
  expect(screen.getByText('結束')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '停留分鐘' })).toHaveValue(90)
  expect(screen.getByRole('button', { name: '10:30' })).toBeInTheDocument()
})

it('editing duration uses durationMin instead of only changing the end time', () => {
  const onTimeChange = jest.fn()
  render(<ItineraryCard place={BASE} index={0} dateIso="2026-06-30" onTimeChange={onTimeChange} />)

  fireEvent.change(screen.getByRole('spinbutton', { name: '停留分鐘' }), {
    target: { value: '120' },
  })

  expect(onTimeChange).toHaveBeenCalledWith('p1', 'durationMin', 120)
})

it('renders three lock buttons when handlers are provided', () => {
  render(
    <ItineraryCard
      place={BASE}
      index={0}
      dateIso="2026-06-30"
      onToggleStartLock={jest.fn()}
      onToggleDurationLock={jest.fn()}
      onToggleEndLock={jest.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: '鎖定開始時間' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '鎖定停留時間' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '鎖定結束時間' })).toBeInTheDocument()
})

it('clicking start, duration, and end locks calls each lock handler', () => {
  const onStart = jest.fn()
  const onDuration = jest.fn()
  const onEnd = jest.fn()

  render(
    <ItineraryCard
      place={BASE}
      index={0}
      dateIso="2026-06-30"
      onToggleStartLock={onStart}
      onToggleDurationLock={onDuration}
      onToggleEndLock={onEnd}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: '鎖定開始時間' }))
  fireEvent.click(screen.getByRole('button', { name: '鎖定停留時間' }))
  fireEvent.click(screen.getByRole('button', { name: '鎖定結束時間' }))

  expect(onStart).toHaveBeenCalledWith('p1')
  expect(onDuration).toHaveBeenCalledWith('p1')
  expect(onEnd).toHaveBeenCalledWith('p1')
})

it('disables the derived third lock when start and duration are already locked', () => {
  const onEnd = jest.fn()
  render(
    <ItineraryCard
      place={{ ...BASE, startLocked: true, durationLocked: true }}
      index={0}
      dateIso="2026-06-30"
      onToggleStartLock={jest.fn()}
      onToggleDurationLock={jest.fn()}
      onToggleEndLock={onEnd}
    />,
  )

  const endButton = screen.getByRole('button', { name: '解鎖結束時間' })
  expect(endButton).toBeDisabled()
  fireEvent.click(endButton)
  expect(onEnd).not.toHaveBeenCalled()
})

it('startLocked makes start time static and removes the drag handle', () => {
  render(
    <ItineraryCard
      place={{ ...BASE, startLocked: true }}
      index={0}
      dateIso="2026-06-30"
      draggable
      onTimeChange={jest.fn()}
      onToggleStartLock={jest.fn()}
      onToggleDurationLock={jest.fn()}
    />,
  )

  expect(screen.getByRole('button', { name: '解鎖開始時間' })).toBeInTheDocument()
  expect(screen.queryByTestId('drag-handle')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '09:00' })).not.toBeInTheDocument()
})

it('durationLocked keeps start editable but makes duration and end static', () => {
  render(
    <ItineraryCard
      place={{ ...BASE, durationLocked: true }}
      index={0}
      dateIso="2026-06-30"
      draggable
      onTimeChange={jest.fn()}
      onToggleStartLock={jest.fn()}
      onToggleDurationLock={jest.fn()}
    />,
  )

  expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '09:00' })).toBeInTheDocument()
  expect(screen.queryByRole('spinbutton', { name: '停留分鐘' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '10:30' })).not.toBeInTheDocument()
})
