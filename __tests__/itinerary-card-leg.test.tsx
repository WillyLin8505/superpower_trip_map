/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { ItineraryCard } from '@/components/ItineraryCard'
import type { ScheduledPlace } from '@/lib/types'

function sp(over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: 'A', placeId: 'A', name: 'A', type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 60, travelMinToNext: 18, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, legMode: 'driving', ...over }
}

it('shows the leg mode label + minutes', () => {
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-01" />)
  expect(screen.getByText(/開車 18 分/)).toBeInTheDocument()
})
it('changing the mode dropdown calls onChangeLegMode', () => {
  const onChangeLegMode = jest.fn()
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-01" onChangeLegMode={onChangeLegMode} />)
  fireEvent.change(screen.getByLabelText('交通工具'), { target: { value: 'transit' } })
  expect(onChangeLegMode).toHaveBeenCalledWith('A', 'transit')
})
it('shows 計算中… while legBusy', () => {
  render(<ItineraryCard place={sp()} index={0} dateIso="2026-07-01" onChangeLegMode={() => {}} legBusy />)
  expect(screen.getByText('計算中…')).toBeInTheDocument()
})
it('renders no leg row for the last place (travelMinToNext null)', () => {
  render(<ItineraryCard place={sp({ travelMinToNext: null, legMode: undefined })} index={0} dateIso="2026-07-01" />)
  expect(screen.queryByText(/分$/)).not.toBeInTheDocument()
})
