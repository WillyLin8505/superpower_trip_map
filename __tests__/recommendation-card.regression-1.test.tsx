/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { RecommendationCard } from '@/components/RecommendationCard'
import type { DayRecommendation } from '@/lib/types'

const rec: DayRecommendation = {
  id: 'p1',
  placeId: 'p1',
  name: 'Museum Cafe',
  type: 'dessert',
  lat: 25,
  lng: 121,
  address: 'Taipei',
  openingHours: null,
  rating: 4.7,
  photoUrl: '/api/photo?ref=one',
  photoUrls: ['/api/photo?ref=one', '/api/photo?ref=two'],
  description: '蛋糕店／咖啡廳',
  reason: 'Google 高評分推薦',
  sourceLabel: 'Google 推薦',
}

it('shows a short explanation on compact recommendation cards', () => {
  // Regression: ISSUE-001 - compact recommendation cards hid the place explanation.
  // Found by /qa on 2026-07-14.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
  render(<RecommendationCard rec={rec} dateIso="2026-07-13" onAdd={() => {}} compact />)

  expect(screen.getByText('蛋糕店／咖啡廳')).toBeInTheDocument()
  expect(screen.queryByText('Google 高評分推薦')).not.toBeInTheDocument()
  expect(screen.queryByText(/Google 推薦/)).not.toBeInTheDocument()
})

it('links compact recommendation titles to Google Maps', () => {
  // Regression: ISSUE-002 - recommendation titles no longer opened Google Maps.
  // Found by /qa on 2026-07-14.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-14.md
  render(<RecommendationCard rec={rec} dateIso="2026-07-13" onAdd={() => {}} compact />)

  const link = screen.getByRole('link', { name: 'Museum Cafe' })
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  expect(link).toHaveAttribute('href', expect.stringContaining('https://www.google.com/maps/search/'))
  expect(link).toHaveAttribute('href', expect.stringContaining('query_place_id=p1'))
})
