/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import { applyTimeEdit } from '@/lib/utils/timeEdit'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
const noop = () => {}

it('end-locked (alone) → start picker editable, end shown static', () => {
  const { container } = render(<ItineraryCard place={sp({ endLocked: true })} index={0} dateIso="2026-07-05" onTimeChange={noop} />)
  // start is free → one picker present; end pinned → static text 10:00
  expect(container.querySelectorAll('[data-testid="time-scroll-picker"]').length).toBe(1)
  expect(screen.getByText('10:00')).toBeInTheDocument()
})
it('two locks (start+duration) → both facets static (no pickers)', () => {
  const { container } = render(<ItineraryCard place={sp({ startLocked: true, durationLocked: true })} index={0} dateIso="2026-07-05" onTimeChange={noop} />)
  expect(screen.getByText('09:00')).toBeInTheDocument()
  expect(screen.getByText('10:00')).toBeInTheDocument()
  expect(container.querySelectorAll('[data-testid="time-scroll-picker"]').length).toBe(0)
})

describe('applyTimeEdit', () => {
  it('end-locked + start edit → keeps end, compensates duration', () => {
    const out = applyTimeEdit(sp({ endLocked: true }), 'startTime', '08:30')
    expect(out.startTime).toBe('08:30')
    expect(out.durationMin).toBe(90)   // end stays 10:00 = 08:30 + 90
  })
  it('non-end-locked start edit → just sets startTime (end follows)', () => {
    const out = applyTimeEdit(sp(), 'startTime', '11:00')
    expect(out.startTime).toBe('11:00')
    expect(out.durationMin).toBe(60)
  })
  it('duration edit → sets durationMin unchanged path', () => {
    const out = applyTimeEdit(sp({ endLocked: true }), 'durationMin', 120)
    expect(out.durationMin).toBe(120)
    expect(out.startTime).toBe('09:00')
  })
  it('start-locked+end-locked (start not free but user edits) → not compensated (start is pinned)', () => {
    // start is user-locked, so applyTimeEdit takes the plain path (guard requires !startLocked)
    const out = applyTimeEdit(sp({ startLocked: true, endLocked: true }), 'startTime', '08:30')
    expect(out.startTime).toBe('08:30')
    expect(out.durationMin).toBe(60)
  })
})
