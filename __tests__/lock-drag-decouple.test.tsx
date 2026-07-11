/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}

it('start-locked card still shows the drag handle (drag decoupled from locks)', () => {
  render(<ItineraryCard place={sp({ startLocked: true })} index={0} dateIso="2026-07-05" draggable />)
  expect(screen.getByTestId('drag-handle')).toBeInTheDocument()
})
