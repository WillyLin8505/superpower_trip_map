/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { TimelineCard } from '@/components/TimelineCard'
import type { ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({ attributes: {}, listeners: {}, setNodeRef: () => {}, transform: null, transition: undefined, isDragging: false }),
}))

// jsdom 26 does not ship PointerEvent; polyfill here to keep jest.setup.ts Lane-A-safe
beforeAll(() => {
  if (typeof window !== 'undefined' && typeof (window as unknown as { PointerEvent?: unknown }).PointerEvent === 'undefined') {
    class PolyPointerEvent extends MouseEvent {
      readonly pointerId: number
      constructor(type: string, params: PointerEventInit & MouseEventInit = {}) {
        super(type, params)
        this.pointerId = params.pointerId ?? 0
      }
    }
    Object.defineProperty(window, 'PointerEvent', { value: PolyPointerEvent, writable: true, configurable: true })
  }
})

function place(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return {
    id: 'a', placeId: 'pid', name: '故宮', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 60, travelMinToNext: null, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false, ...over,
  }
}

test('renders content and a resize handle when unlocked', () => {
  render(<TimelineCard place={place()} index={0} dateIso="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.getByText('故宮')).toBeInTheDocument()
  expect(screen.getByTestId('resize-handle-a')).toBeInTheDocument()
})

test('durationLocked hides resize handle, shows lock mark', () => {
  render(<TimelineCard place={place({ durationLocked: true })} index={0} dateIso="2026-06-29" draggable onTimeChange={jest.fn()} />)
  expect(screen.queryByTestId('resize-handle-a')).not.toBeInTheDocument()
  expect(screen.getByTestId('duration-locked-mark')).toBeInTheDocument()
})

test('drag bottom edge down lengthens duration via onTimeChange', () => {
  const onTimeChange = jest.fn()
  render(<TimelineCard place={place({ durationMin: 60 })} index={0} dateIso="2026-06-29" draggable onTimeChange={onTimeChange} />)
  const handle = screen.getByTestId('resize-handle-a')
  fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(handle, { clientY: 136, pointerId: 1 }) // +36px /1.2 = +30min
  fireEvent.pointerUp(handle, { clientY: 136, pointerId: 1 })
  expect(onTimeChange).toHaveBeenCalledWith('a', 'durationMin', 90)
})
