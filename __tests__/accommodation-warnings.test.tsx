/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
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
it('card warns when durationMin is below the suggested DWELL', () => {
  // attraction DWELL = 90; 60 < 90 → warn
  render(<ItineraryCard place={sp('A', 'attraction', { durationMin: 60 })} index={0} dateIso="2026-06-30" />)
  expect(screen.getByText(/停留少於建議/)).toBeInTheDocument()
})
it('card does not warn when durationMin meets the suggested DWELL', () => {
  render(<ItineraryCard place={sp('A', 'attraction', { durationMin: 90 })} index={0} dateIso="2026-06-30" />)
  expect(screen.queryByText(/停留少於建議/)).not.toBeInTheDocument()
})
