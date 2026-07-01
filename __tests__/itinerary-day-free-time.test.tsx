/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
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

it('renders a free-time pill after a card when a gap >= 15 exists', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 }) // ends+travel 10:10
  const B = sp('B', { startTime: '11:00', durationMin: 60, startLocked: true })   // gap 50
  render(<ItineraryDay day={day([A, B], { dayEnd: '12:00' })} dayIdx={0} mode="driving" startDate="2026-07-01" />)
  expect(screen.getByTestId('free-block-A')).toHaveTextContent('空閒 50 分')
})
it('renders a day-end pill with 到 HH:MM', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60 }) // ends 10:00 → remaining to 21:00 = 660 = 11 小時
  render(<ItineraryDay day={day([A])} dayIdx={0} mode="driving" startDate="2026-07-01" />)
  expect(screen.getByTestId('free-block-A')).toHaveTextContent('空閒 11 小時（到 21:00）')
})
it('renders no pill when all gaps are below threshold', () => {
  const A = sp('A', { startTime: '09:00', durationMin: 60, travelMinToNext: 10 }) // ends+travel 10:10
  const B = sp('B', { startTime: '10:20', durationMin: 60 })                       // gap 10 < 15
  render(<ItineraryDay day={day([A, B], { dayEnd: '11:30' })} dayIdx={0} mode="driving" startDate="2026-07-01" />)
  expect(screen.queryByText(/空閒/)).not.toBeInTheDocument()
})
