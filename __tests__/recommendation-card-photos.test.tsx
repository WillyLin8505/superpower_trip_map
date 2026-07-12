/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import type { DayRecommendation } from '@/lib/types'
import { RecommendationCard } from '@/components/RecommendationCard'

const rec: DayRecommendation = {
  id: 'p1',
  placeId: 'p1',
  name: 'Avoccino',
  type: 'dessert',
  lat: 21.03,
  lng: 105.84,
  address: 'Hanoi',
  openingHours: null,
  rating: 4.9,
  photoUrl: '/api/photo?ref=one',
  photoUrls: ['/api/photo?ref=one', '/api/photo?ref=two'],
  description: 'Coffee shop',
  reason: 'Good coffee',
  sourceLabel: 'Google',
}

it('opens photo lightbox without triggering add', () => {
  const onAdd = jest.fn()
  render(<RecommendationCard rec={rec} dateIso="2026-07-12" onAdd={onAdd} />)

  fireEvent.click(screen.getByRole('button', { name: '檢視 Avoccino 照片 2' }))

  expect(onAdd).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByAltText('Avoccino 照片 2')).toHaveAttribute('src', '/api/photo?ref=two')
})
