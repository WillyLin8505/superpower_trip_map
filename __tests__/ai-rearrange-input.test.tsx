/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AiRearrangeInput } from '@/components/AiRearrangeInput'
import type { PlanResult, ScheduledPlace, DayItinerary } from '@/lib/types'

const rearrangeItinerary = jest.fn()
jest.mock('@/app/actions/rearrange', () => ({ rearrangeItinerary: (...a: unknown[]) => rearrangeItinerary(...a) }))

function sp(name: string, over: Partial<ScheduledPlace> = {}): ScheduledPlace {
  return { id: name, placeId: name, name, type: 'attraction', lat: 0, lng: 0, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null, startTime: '09:00',
    durationMin: 90, travelMinToNext: null, aiDescription: null, outsideHours: false,
    lateExit: false, startLocked: false, durationLocked: false, ...over }
}
function d(day: number, places: ScheduledPlace[]): DayItinerary {
  return { day, places, aiSummary: null, dayStart: '09:00', dayEnd: '21:00' }
}
function plan(): PlanResult {
  return { days: [d(1, [sp('A'), sp('B')]), d(2, [sp('C')])], transportMode: 'driving', startDate: '2026-07-10' }
}
const CHANGES = [
  { id: 'move-B', day: 1, kind: 'move', placeId: 'B', placeName: 'B', toDay: 2 },
  { id: 'win-1-dayStart', day: 1, kind: 'window', field: 'dayStart', from: '09:00', to: '10:00' },
]

beforeEach(() => { rearrangeItinerary.mockReset() })

it('submits the instruction and lists changes grouped by day', async () => {
  rearrangeItinerary.mockResolvedValue({ ok: true, changes: CHANGES, summary: '摘要' })
  render(<AiRearrangeInput plan={plan()} onApply={() => {}} />)
  fireEvent.change(screen.getByPlaceholderText(/第二天太滿/), { target: { value: '把B移到第二天' } })
  fireEvent.click(screen.getByRole('button', { name: '重排' }))
  await waitFor(() => expect(screen.getByText(/B 移到第 2 天/)).toBeInTheDocument())
  expect(screen.queryByText('摘要')).not.toBeInTheDocument()
  expect(screen.getByText(/活動開始 09:00 → 10:00/)).toBeInTheDocument()
  expect(rearrangeItinerary).toHaveBeenCalledWith(expect.anything(), '把B移到第二天')
})

it('removing a change with ✗ excludes it; 一鍵同意全部 applies only the rest', async () => {
  rearrangeItinerary.mockResolvedValue({ ok: true, changes: CHANGES, summary: '摘要' })
  const onApply = jest.fn()
  render(<AiRearrangeInput plan={plan()} onApply={onApply} />)
  fireEvent.change(screen.getByPlaceholderText(/第二天太滿/), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: '重排' }))
  await screen.findByText(/B 移到第 2 天/)
  // ✗ the move
  fireEvent.click(screen.getByRole('button', { name: '移除 B 移到第 2 天' }))
  fireEvent.click(screen.getByRole('button', { name: '一鍵同意全部' }))
  expect(onApply).toHaveBeenCalledTimes(1)
  const newPlan: PlanResult = onApply.mock.calls[0][0]
  // move rejected → B stays on day 1; window accepted → day1 start 10:00
  expect(newPlan.days[0].places.map((p) => p.placeId)).toEqual(['A', 'B'])
  expect(newPlan.days[0].dayStart).toBe('10:00')
})

it('shows an error and does not call onApply when the action fails', async () => {
  rearrangeItinerary.mockResolvedValue({ ok: false, error: 'AI 重排失敗，請換個說法再試' })
  const onApply = jest.fn()
  render(<AiRearrangeInput plan={plan()} onApply={onApply} />)
  fireEvent.change(screen.getByPlaceholderText(/第二天太滿/), { target: { value: 'x' } })
  fireEvent.click(screen.getByRole('button', { name: '重排' }))
  await waitFor(() => expect(screen.getByText('AI 重排失敗，請換個說法再試')).toBeInTheDocument())
  expect(onApply).not.toHaveBeenCalled()
})
