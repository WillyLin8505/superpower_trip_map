/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { TimelineDay } from '@/components/TimelineDay'
import type { DayItinerary, ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/core', () => ({ useDroppable: () => ({ setNodeRef: () => {}, isOver: false }) }))
jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
}))

function sp(over: Partial<ScheduledPlace>): ScheduledPlace {
  return {
    id: 'a', placeId: 'pid', name: 'X', type: 'attraction', lat: 25.03, lng: 121.56, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

const day: DayItinerary = {
  day: 1, aiSummary: null, dayStart: '09:00', dayEnd: '21:00',
  places: [
    sp({ id: 'a', name: '故宮', startTime: '09:00', durationMin: 60, travelMinToNext: 20 }),
    sp({ id: 'b', name: '好吃的店', type: 'restaurant', startTime: '10:20', durationMin: 90 }),
  ],
}

test('renders place names, a ruler hour label and the day header', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" startDate="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByText('好吃的店')).toBeInTheDocument()
  expect(screen.getByText('11:00')).toBeInTheDocument()  // ruler tick
  expect(screen.getByText(/第 1 天/)).toBeInTheDocument()       // header with date label
})

test('renders a travel-gap connector between stops', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" startDate="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByTestId('travel-gap-a')).toBeInTheDocument()
  expect(screen.getByText(/20 分鐘/)).toBeInTheDocument()
})

test('window editor renders when onChangeWindow provided', () => {
  render(<TimelineDay day={day} dayIdx={0} mode="driving" startDate="2026-06-29" draggable onChangeWindow={jest.fn()} />)
  expect(screen.getByText('活動')).toBeInTheDocument()
})
