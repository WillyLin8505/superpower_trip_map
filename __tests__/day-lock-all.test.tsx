/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function place(id: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id, placeId: 'g'+id, name: id, type: 'attraction', lat: 0, lng: 0,
    address: 'a', openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}
const day = (places: ScheduledPlace[]): DayItinerary => ({ day: 1, places, aiSummary: null })

it('shows "整天鎖開始" as unlocked when not all start-locked, and locks all on click', () => {
  const onSet = jest.fn()
  render(<ItineraryDay day={day([place('a'), place('b')])} dayIdx={0} mode="driving"
    onSetDayStartLock={onSet} onSetDayDurationLock={jest.fn()} />)
  const btn = screen.getByRole('button', { name: /整天鎖開始/ })
  expect(btn.textContent).toContain('🔓')
  fireEvent.click(btn)
  expect(onSet).toHaveBeenCalledWith(true)
})

it('shows locked state when all places are start-locked, and unlocks all on click', () => {
  const onSet = jest.fn()
  render(<ItineraryDay day={day([place('a', { startLocked: true }), place('b', { startLocked: true })])}
    dayIdx={0} mode="driving" onSetDayStartLock={onSet} onSetDayDurationLock={jest.fn()} />)
  const btn = screen.getByRole('button', { name: /整天鎖開始/ })
  expect(btn.textContent).toContain('🔒')
  fireEvent.click(btn)
  expect(onSet).toHaveBeenCalledWith(false)
})

it('duration lock-all toggles durationLocked for the whole day', () => {
  const onSet = jest.fn()
  render(<ItineraryDay day={day([place('a'), place('b')])} dayIdx={0} mode="driving"
    onSetDayStartLock={jest.fn()} onSetDayDurationLock={onSet} />)
  fireEvent.click(screen.getByRole('button', { name: /整天鎖停留/ }))
  expect(onSet).toHaveBeenCalledWith(true)
})

it('disables lock-all buttons for an empty day', () => {
  render(<ItineraryDay day={day([])} dayIdx={0} mode="driving"
    onSetDayStartLock={jest.fn()} onSetDayDurationLock={jest.fn()} />)
  expect(screen.getByRole('button', { name: /整天鎖開始/ })).toBeDisabled()
})
