/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryDay } from '@/components/ItineraryDay'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

function sp(name: string, type: ScheduledPlace['type'], over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type, lat: 0, lng: 0, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null, startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const day = (places: ScheduledPlace[]): DayItinerary => ({ day: 1, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' })

it('non-last day without accommodation shows the missing-lodging warning', () => {
  render(<ItineraryDay day={day([sp('A', 'attraction')])} dayIdx={0} mode="driving" startDate="2026-06-28" isLastDay={false} />)
  expect(screen.getByText(/這天沒有住宿/)).toBeInTheDocument()
})
it('last day without accommodation does NOT warn', () => {
  render(<ItineraryDay day={day([sp('A', 'attraction')])} dayIdx={0} mode="driving" startDate="2026-06-28" isLastDay={true} />)
  expect(screen.queryByText(/這天沒有住宿/)).not.toBeInTheDocument()
})
it('day with an accommodation card does NOT warn', () => {
  render(<ItineraryDay day={day([sp('A', 'attraction'), sp('H', 'accommodation')])} dayIdx={0} mode="driving" startDate="2026-06-28" isLastDay={false} />)
  expect(screen.queryByText(/這天沒有住宿/)).not.toBeInTheDocument()
})
// 建議停留(SUGGESTED_DURATION):景點 120 / 餐廳 90 / 甜點 60 / 住宿=無
it('card warns 少於建議 when attraction duration is below suggested (120)', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { durationMin: 90 })} index={0} dateIso="2026-06-30" />)
  expect(screen.getByText(/停留少於建議（建議 120 分）/)).toBeInTheDocument()
})
it('card warns 超過建議 when attraction duration exceeds suggested (120)', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { durationMin: 180 })} index={0} dateIso="2026-06-30" />)
  expect(screen.getByText(/停留超過建議（建議 120 分）/)).toBeInTheDocument()
})
it('card does not warn when attraction duration exactly meets suggested (120)', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { durationMin: 120 })} index={0} dateIso="2026-06-30" />)
  expect(screen.queryByText(/停留少於建議|停留超過建議/)).not.toBeInTheDocument()
})
it('restaurant suggested is 90: warns below and above', () => {
  const { rerender } = render(<ItineraryCard place={sp('R', 'restaurant', { durationMin: 60 })} index={0} dateIso="2026-06-30" />)
  expect(screen.getByText(/停留少於建議（建議 90 分）/)).toBeInTheDocument()
  rerender(<ItineraryCard place={sp('R', 'restaurant', { durationMin: 120 })} index={0} dateIso="2026-06-30" />)
  expect(screen.getByText(/停留超過建議（建議 90 分）/)).toBeInTheDocument()
})
it('accommodation has no suggested duration → never warns 少於/超過', () => {
  const { rerender } = render(<ItineraryCard place={sp('H', 'accommodation', { durationMin: 10 })} index={0} dateIso="2026-06-30" />)
  expect(screen.queryByText(/停留少於建議|停留超過建議/)).not.toBeInTheDocument()
  rerender(<ItineraryCard place={sp('H', 'accommodation', { durationMin: 600 })} index={0} dateIso="2026-06-30" />)
  expect(screen.queryByText(/停留少於建議|停留超過建議/)).not.toBeInTheDocument()
})
it('warns 超出當天活動時間 when a place ends after dayEnd', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { startTime: '20:00', durationMin: 120 })} index={0} dateIso="2026-06-30" dayEnd="21:00" />)
  expect(screen.getByText(/超出當天活動時間/)).toBeInTheDocument()
})
it('does not warn 超出當天活動時間 when a place ends within dayEnd', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { startTime: '19:00', durationMin: 120 })} index={0} dateIso="2026-06-30" dayEnd="21:00" />)
  expect(screen.queryByText(/超出當天活動時間/)).not.toBeInTheDocument()
})
it('does not warn 超出當天活動時間 when a place ends exactly at dayEnd', () => {
  render(<ItineraryCard place={sp('A', 'accommodation', { startTime: '20:00', durationMin: 60 })} index={0} dateIso="2026-06-30" dayEnd="21:00" />)
  expect(screen.queryByText(/超出當天活動時間/)).not.toBeInTheDocument()
})
it('does not warn 超出當天活動時間 when dayEnd is not provided', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { startTime: '20:00', durationMin: 120 })} index={0} dateIso="2026-06-30" />)
  expect(screen.queryByText(/超出當天活動時間/)).not.toBeInTheDocument()
})
it('renders a 刪除地點 button that calls onDeletePlace with the place id', () => {
  const onDeletePlace = jest.fn()
  render(<ItineraryCard place={sp('A', 'attraction')} index={0} dateIso="2026-06-30" onDeletePlace={onDeletePlace} />)
  fireEvent.click(screen.getByRole('button', { name: '刪除地點' }))
  expect(onDeletePlace).toHaveBeenCalledWith('A')
})
it('does not render the delete button when onDeletePlace is absent', () => {
  render(<ItineraryCard place={sp('A', 'attraction')} index={0} dateIso="2026-06-30" />)
  expect(screen.queryByRole('button', { name: '刪除地點' })).not.toBeInTheDocument()
})
