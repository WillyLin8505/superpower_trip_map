/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({ setNodeRef: jest.fn(), isOver: false }),
}))
jest.mock('@/components/ItineraryCard', () => ({
  ItineraryCard: ({ place }: { place: ScheduledPlace }) => <div>{place.name}</div>,
}))
jest.mock('@/lib/utils/mapUrl', () => ({
  buildDayEmbedUrl: jest.fn((places: ScheduledPlace[]) =>
    places.length >= 2 ? 'https://maps.google.com/embed/test' : ''
  ),
}))

import { ItineraryDay } from '@/components/ItineraryDay'

function makePlace(name: string): ScheduledPlace {
  return {
    id: name, placeId: name, name, type: 'attraction',
    lat: 25, lng: 121, address: '', openingHours: null, rating: null,
    photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: null,
    aiDescription: null, outsideHours: false,
  }
}

const DAY_TWO_PLACES: DayItinerary = {
  day: 1,
  places: [makePlace('景點A'), makePlace('景點B')],
  aiSummary: null,
}

test('renders iframe with embed URL when 2+ places', () => {
  render(<ItineraryDay day={DAY_TWO_PLACES} dayIdx={0} mode="driving" />)
  const iframe = screen.getByTitle('第 1 天路線地圖')
  expect(iframe).toBeInTheDocument()
  expect(iframe).toHaveAttribute('src', 'https://maps.google.com/embed/test')
})

test('does not render iframe when only 1 place', () => {
  const onePlace = { ...DAY_TWO_PLACES, places: [makePlace('景點A')] }
  render(<ItineraryDay day={onePlace} dayIdx={0} mode="driving" />)
  expect(screen.queryByTitle('第 1 天路線地圖')).toBeNull()
})

test('passes mode to buildDayEmbedUrl', () => {
  const { buildDayEmbedUrl } = require('@/lib/utils/mapUrl')
  render(<ItineraryDay day={DAY_TWO_PLACES} dayIdx={0} mode="transit" />)
  expect(buildDayEmbedUrl).toHaveBeenCalledWith(DAY_TWO_PLACES.places, 'transit')
})
