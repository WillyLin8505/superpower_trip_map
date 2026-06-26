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
  timeLocked: false,
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

test('renders lock button when onToggleLock is provided', () => {
  const mockToggle = jest.fn()
  render(<ItineraryCard place={BASE_PLACE} index={0} onToggleLock={mockToggle} />)
  expect(screen.getByRole('button', { name: '鎖定時間' })).toBeInTheDocument()
})

test('clicking lock button calls onToggleLock with place id', () => {
  const mockToggle = jest.fn()
  render(<ItineraryCard place={BASE_PLACE} index={0} onToggleLock={mockToggle} />)
  fireEvent.click(screen.getByRole('button', { name: '鎖定時間' }))
  expect(mockToggle).toHaveBeenCalledWith('id-1')
})

test('shows 解鎖時間 aria-label when timeLocked is true', () => {
  render(
    <ItineraryCard
      place={{ ...BASE_PLACE, timeLocked: true }}
      index={0}
      onToggleLock={jest.fn()}
    />
  )
  expect(screen.getByRole('button', { name: '解鎖時間' })).toBeInTheDocument()
})

test('hides TimeEditors and shows static time text when timeLocked', () => {
  render(
    <ItineraryCard
      place={{ ...BASE_PLACE, timeLocked: true }}
      index={0}
      onTimeChange={jest.fn()}
      onToggleLock={jest.fn()}
    />
  )
  // Static text visible
  expect(screen.getByText(/09:00 · 停留 90 分鐘/)).toBeInTheDocument()
  // No editable time buttons (TimeEditor renders as a button with "開始:" prefix)
  expect(screen.queryByRole('button', { name: /開始:/ })).toBeNull()
})

test('shows lateExit warning when lateExit is true', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, lateExit: true }} index={0} />)
  expect(screen.getByText(/結束時間超出營業時間/)).toBeInTheDocument()
})

test('does not show lateExit warning when lateExit is false', () => {
  render(<ItineraryCard place={{ ...BASE_PLACE, lateExit: false }} index={0} />)
  expect(screen.queryByText(/結束時間超出營業時間/)).toBeNull()
})
