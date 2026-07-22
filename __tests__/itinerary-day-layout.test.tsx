/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ItineraryDay } from '@/components/ItineraryDay'
import type { DayItinerary } from '@/lib/types'

function place(id: string, lat: number, lng: number) {
  return {
    id, placeId: id, name: `景點${id}`, type: 'attraction' as const, lat, lng, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    startTime: '09:00', durationMin: 90, travelMinToNext: 0, aiDescription: null,
    outsideHours: false, lateExit: false, startLocked: false, durationLocked: false,
  }
}

const day: DayItinerary = {
  day: 1, aiSummary: '今天走文青路線', dayStart: '09:00', dayEnd: '21:00',
  // buildDayEmbedUrl needs >= 2 places to render a route embed
  places: [place('x', 25, 121), place('y', 25.1, 121.1)],
}

const OLD_ENV = process.env

beforeEach(() => {
  process.env = { ...OLD_ENV, NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: 'test-key' }
})
afterEach(() => {
  process.env = OLD_ENV
})

it('renders the map full-width without the AI summary, not inside the side column', () => {
  render(
    <ItineraryDay day={day} dayIdx={0} mode="driving" startDate="2026-07-01" onAddRecommendation={() => {}} />
  )
  const map = screen.getByTitle('第 1 天路線地圖')
  expect(screen.queryByText('今天走文青路線')).not.toBeInTheDocument()
  expect(screen.getByTestId('day-map-fullwidth')).toContainElement(map)
})

it('renders SidePanel (not the old bare DayRecommendations sidebar) alongside the day column', () => {
  render(
    <ItineraryDay day={day} dayIdx={0} mode="driving" startDate="2026-07-01" onAddRecommendation={() => {}} />
  )
  expect(screen.getByTestId('side-panel')).toBeInTheDocument()
})

it('day column and side panel share the same row container with equal-height stretch', () => {
  render(
    <ItineraryDay day={day} dayIdx={0} mode="driving" startDate="2026-07-01" onAddRecommendation={() => {}} />
  )
  const row = screen.getByTestId('day-content-row')
  expect(row).toContainElement(screen.getByTestId('side-panel'))
  expect(row.className).toContain('items-stretch')
})

it('stacks on small screens: row is flex-col below lg, side panel full-width below lg', () => {
  // QA regression: at 375px the fixed w-96 panel squeezed the itinerary to ~120px
  render(
    <ItineraryDay day={day} dayIdx={0} mode="driving" startDate="2026-07-01" onAddRecommendation={() => {}} />
  )
  const row = screen.getByTestId('day-content-row')
  expect(row.className).toContain('flex-col')
  expect(row.className).toContain('lg:flex-row')
  const panelWrap = screen.getByTestId('side-panel').parentElement as HTMLElement
  expect(panelWrap.className).toContain('w-full')
  expect(panelWrap.className).toContain('lg:w-96')
})
