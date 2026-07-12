/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { RecommendationCard } from '@/components/RecommendationCard'
import type { DayRecommendation } from '@/lib/types'

const rec: DayRecommendation = {
  id: 'p1', placeId: 'ChIJ-rec1', name: '某景點', type: 'attraction',
  lat: 25, lng: 121, address: '台北',
  openingHours: null, rating: null, photoUrl: null, description: null,
  reason: '必訪', sourceLabel: '部落格',
}

it('shows a link to open the recommendation in Google Maps', () => {
  render(<RecommendationCard rec={rec} dateIso="2026-07-12" onAdd={() => {}} />)
  const link = screen.getByRole('link', { name: '在 Google Maps 開啟' })
  expect(link).toHaveAttribute('href', expect.stringContaining('query_place_id=ChIJ-rec1'))
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
})
