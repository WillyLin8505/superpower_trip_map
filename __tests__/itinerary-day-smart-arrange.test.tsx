/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function day(places: ScheduledPlace[], over: Partial<DayItinerary> = {}): DayItinerary {
  return { day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00', ...over }
}
const base = {
  dayIdx: 0, mode: 'driving' as const, startDate: '2026-07-04',
}

it('renders both checkboxes checked by default (undefined → ?? true)', () => {
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect((screen.getByLabelText('避開壅塞') as HTMLInputElement).checked).toBe(true)
  expect((screen.getByLabelText('避開人潮') as HTMLInputElement).checked).toBe(true)
})

it('clicking 智慧排程 calls onSmartArrange', () => {
  const onSmartArrange = jest.fn()
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} onSmartArrange={onSmartArrange} onSetAvoid={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '智慧排程' }))
  expect(onSmartArrange).toHaveBeenCalledTimes(1)
})

it('toggling a checkbox calls onSetAvoid with the field and new value', () => {
  const onSetAvoid = jest.fn()
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} onSmartArrange={() => {}} onSetAvoid={onSetAvoid} />)
  fireEvent.click(screen.getByLabelText('避開壅塞'))
  expect(onSetAvoid).toHaveBeenCalledWith('avoidTraffic', false)
})

it('button is disabled when both options are off', () => {
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')], { avoidTraffic: false, avoidCrowds: false })}
    onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect(screen.getByRole('button', { name: '智慧排程' })).toBeDisabled()
})

it('button is disabled and shows 排程中… while arranging', () => {
  render(<ItineraryDay {...base} day={day([sp('A'), sp('B')])} arranging onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect(screen.getByRole('button', { name: '排程中…' })).toBeDisabled()
})

it('button is disabled when fewer than 2 unlocked places', () => {
  render(<ItineraryDay {...base} day={day([sp('A', { startLocked: true }), sp('B')])}
    onSmartArrange={() => {}} onSetAvoid={() => {}} />)
  expect(screen.getByRole('button', { name: '智慧排程' })).toBeDisabled()
})
