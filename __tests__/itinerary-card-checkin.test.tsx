/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'H', placeId: 'H', name: 'H', type: 'accommodation', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '13:00',
    durationMin: 120, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}

it('warns when an accommodation checks in before 15:00', () => {
  render(<ItineraryCard place={sp({ startTime: '13:00' })} index={0} dateIso="2026-07-10" />)
  expect(screen.getByText(/早於一般 check-in 時間（15:00）/)).toBeInTheDocument()
})
it('does not warn when check-in is 15:00 or later', () => {
  render(<ItineraryCard place={sp({ startTime: '15:00' })} index={0} dateIso="2026-07-10" />)
  expect(screen.queryByText(/早於一般 check-in/)).not.toBeInTheDocument()
})
it('does not warn for a non-accommodation place before 15:00', () => {
  render(<ItineraryCard place={sp({ type: 'attraction', startTime: '13:00' })} index={0} dateIso="2026-07-10" />)
  expect(screen.queryByText(/早於一般 check-in/)).not.toBeInTheDocument()
})
