/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const handlers = { onToggleStartLock: () => {}, onToggleDurationLock: () => {}, onToggleEndLock: jest.fn() }

it('renders three lock toggles: 開始 / 停留 / 結束', () => {
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-05" {...handlers} />)
  expect(screen.getByRole('button', { name: /開始/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /停留/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /結束/ })).toBeInTheDocument()
})
it('the derived third lock is disabled when the other two are locked', () => {
  // start + duration locked → 結束 is derived → disabled
  render(<ItineraryCard place={sp({ startLocked: true, durationLocked: true })} index={0} dateIso="2026-07-05" {...handlers} />)
  expect(screen.getByRole('button', { name: /結束/ })).toBeDisabled()
})
it('clicking 結束 calls onToggleEndLock', () => {
  const onToggleEndLock = jest.fn()
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-05" {...handlers} onToggleEndLock={onToggleEndLock} />)
  fireEvent.click(screen.getByRole('button', { name: /結束/ }))
  expect(onToggleEndLock).toHaveBeenCalledWith('A')
})
