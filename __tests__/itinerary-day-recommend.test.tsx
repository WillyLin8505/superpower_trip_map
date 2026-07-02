/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { CategoryBuckets, DayItinerary, DayRecommendation } from '@/lib/types'

function rec(placeId: string, type: DayRecommendation['type']): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}

const recs: CategoryBuckets = {
  dessert: [rec('d1', 'dessert')], attraction: [], restaurant: [],
}

const day: DayItinerary = {
  day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
  places: [{
    id: 'x', placeId: 'x', name: '景點X', type: 'attraction', lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
  }],
}

it('renders DayRecommendations and forwards adds', () => {
  const onAddRecommendation = jest.fn()
  render(
    <DndContext>
      <ItineraryDay
        day={day} dayIdx={0} mode="driving" startDate="2026-07-01"
        recommendations={recs} onAddRecommendation={onAddRecommendation}
      />
    </DndContext>
  )
  expect(screen.getByTestId('day-recommendations')).toBeInTheDocument()
  fireEvent.click(screen.getByTestId('rec-add-d1'))
  expect(onAddRecommendation).toHaveBeenCalledWith(recs.dessert[0])
})
