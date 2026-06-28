/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import type { ScheduledPlace } from '@/lib/types'

jest.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))
jest.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))
jest.mock('@/lib/utils/hours', () => ({
  getTodayHours: jest.fn(() => '9:00 AM – 5:00 PM'),
}))
jest.mock('@/components/TimeScrollPicker', () => ({
  TimeScrollPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button type="button" onClick={() => onChange(value)}>{value}</button>
  ),
}))

import { ItineraryCard } from '@/components/ItineraryCard'

const BASE_PLACE: ScheduledPlace = {
  id: 'id-1',
  placeId: 'pid-1',
  name: '測試景點',
  type: 'attraction',
  lat: 25.04,
  lng: 121.56,
  address: '地址',
  openingHours: ['Monday: 9:00 AM – 5:00 PM'],
  rating: 4.5,
  photoUrl: null,
  description: null,
  startTime: '09:00',
  durationMin: 90,
  travelMinToNext: 15,
  aiDescription: null,
  outsideHours: false,
  lateExit: false,
  startLocked: false,
  durationLocked: false,
}

test('shows today opening hours', () => {
  render(<ItineraryCard place={BASE_PLACE} index={0} />)
  expect(screen.getByText(/今日.*9:00 AM/)).toBeInTheDocument()
})

test('shows Google description when available', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, description: 'Google 說明' }} index={0} />)
  expect(screen.getByText('Google 說明')).toBeInTheDocument()
})

test('falls back to aiDescription when description is null', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, description: null, aiDescription: 'AI 說明' }} index={0} />)
  expect(screen.getByText('AI 說明')).toBeInTheDocument()
})

test('shows Google description over aiDescription when both exist', () => {
  render(
    <ItineraryCard
      place={{ ...BASE_PLACE, description: 'Google 說明', aiDescription: 'AI 說明' }}
      index={0}
    />
  )
  expect(screen.getByText('Google 說明')).toBeInTheDocument()
  expect(screen.queryByText('AI 說明')).toBeNull()
})

test('does not render 票價 label', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, description: '某說明' }} index={0} />)
  expect(screen.queryByText(/票價/)).toBeNull()
})

test('hides opening hours row when getTodayHours returns null', () => {
  const { getTodayHours } = require('@/lib/utils/hours')
  ;(getTodayHours as jest.Mock).mockReturnValueOnce(null)
  render(<ItineraryCard place={{ ...BASE_PLACE, openingHours: null }} index={0} />)
  expect(screen.queryByText(/今日/)).toBeNull()
})

test('shows 甜點 badge with pink style for dessert type', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, type: 'dessert' }} index={0} />)
  const badge = screen.getByText('甜點')
  expect(badge).toBeInTheDocument()
  expect(badge.className).toContain('bg-pink-100')
  expect(badge.className).toContain('text-pink-700')
})

test('shows start→end time for read-only card (no onTimeChange)', () => {
  render(<ItineraryCard place={BASE_PLACE} index={0} />)
  // BASE_PLACE: startTime=09:00, durationMin=90 → end=10:30
  // With split-lock design, each time is a separate static span (no picker buttons)
  expect(screen.getByText('09:00')).toBeInTheDocument()
  expect(screen.getByText('10:30')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '09:00' })).toBeNull()
  expect(screen.queryByRole('button', { name: '10:30' })).toBeNull()
})

test('shows lateExit warning when lateExit is true', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, lateExit: true }} index={0} />)
  expect(screen.getByText(/結束時間超出營業時間/)).toBeInTheDocument()
})

test('does not show lateExit warning when lateExit is false', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, lateExit: false }} index={0} />)
  expect(screen.queryByText(/結束時間超出營業時間/)).toBeNull()
})
