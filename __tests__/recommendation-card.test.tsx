/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecommendationCard } from '@/components/RecommendationCard'
import type { DayRecommendation } from '@/lib/types'

const rec: DayRecommendation = {
  id: 'p1', placeId: 'p1', name: '某景點', type: 'attraction',
  lat: 25, lng: 121, address: '台北',
  openingHours: ['星期一: 09:00 – 18:00', '星期二: 09:00 – 18:00', '星期三: 09:00 – 18:00',
    '星期四: 09:00 – 18:00', '星期五: 09:00 – 18:00', '星期六: 09:00 – 18:00', '星期日: 09:00 – 18:00'],
  rating: 4.7, photoUrl: null, description: '很棒的地方',
  reason: '必訪', sourceLabel: '部落格',
}

it('renders name, type badge, rating, description and source', () => {
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={() => {}} />)
  expect(screen.getByText('某景點')).toBeInTheDocument()
  expect(screen.getByText('景點')).toBeInTheDocument()
  expect(screen.getByText(/4.7/)).toBeInTheDocument()
  expect(screen.getByText('很棒的地方')).toBeInTheDocument()
  expect(screen.getByText(/部落格/)).toBeInTheDocument()
})

it('calls onAdd when the arrow button is clicked', () => {
  const onAdd = jest.fn()
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={onAdd} />)
  fireEvent.click(screen.getByTestId('rec-add-p1'))
  expect(onAdd).toHaveBeenCalledTimes(1)
})
