/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { CardContent } from '@/components/CardContent'
import type { ScheduledPlace } from '@/lib/types'

function place(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: 'a', placeId: 'pid', name: '故宮', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: 4.5, photoUrl: null, description: '世界級博物館',
    startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

test('renders name, rating and description', () => {
  render(<CardContent place={place()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByText(/世界級博物館/)).toBeInTheDocument()
  expect(screen.getByText(/4\.5/)).toBeInTheDocument()
})

test('lock buttons fire callbacks', () => {
  const onStart = jest.fn()
  const onDur = jest.fn()
  render(<CardContent place={place()} onToggleStartLock={onStart} onToggleDurationLock={onDur} />)
  fireEvent.click(screen.getByLabelText('鎖定開始時間'))
  fireEvent.click(screen.getByLabelText('鎖定停留時間'))
  expect(onStart).toHaveBeenCalledWith('a')
  expect(onDur).toHaveBeenCalledWith('a')
})

test('lateExit warning shown when flagged', () => {
  render(<CardContent place={place({ lateExit: true })} />)
  expect(screen.getByText(/結束時間超出營業時間/)).toBeInTheDocument()
})
