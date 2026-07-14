/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecommendationCard } from '@/components/RecommendationCard'
import type { DayRecommendation } from '@/lib/types'

const rec: DayRecommendation = {
  id: 'p1',
  placeId: 'p1',
  name: 'Museum Cafe',
  type: 'attraction',
  lat: 25,
  lng: 121,
  address: 'Taipei',
  openingHours: [
    'Monday: 9:00 AM – 6:00 PM',
    'Tuesday: 9:00 AM – 6:00 PM',
    'Wednesday: 9:00 AM – 6:00 PM',
    'Thursday: 9:00 AM – 6:00 PM',
    'Friday: 9:00 AM – 6:00 PM',
    'Saturday: 9:00 AM – 6:00 PM',
    'Sunday: 9:00 AM – 6:00 PM',
  ],
  rating: 4.7,
  photoUrl: '/api/photo?ref=one',
  photoUrls: ['/api/photo?ref=one', '/api/photo?ref=two'],
  description: 'A scenic museum cafe.',
  reason: 'Good stop nearby.',
  sourceLabel: 'Google',
}

it('renders the full card when not compact', () => {
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={() => {}} />)

  expect(screen.getByText('Museum Cafe')).toBeInTheDocument()
  expect(screen.getByText(/4.7/)).toBeInTheDocument()
  expect(screen.getByText('A scenic museum cafe.')).toBeInTheDocument()
  expect(screen.getByText('Good stop nearby.')).toBeInTheDocument()
  expect(screen.getByText(/Google/)).toBeInTheDocument()
})

it('renders name, category, one cover photo, and a short explanation in compact mode', () => {
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={() => {}} compact />)

  expect(screen.getByText('Museum Cafe')).toBeInTheDocument()
  expect(screen.getByTestId('photo-thumb-0')).toBeInTheDocument()
  expect(screen.queryByTestId('photo-thumb-1')).toBeNull()
  expect(screen.queryByText(/4.7/)).not.toBeInTheDocument()
  expect(screen.getByText('A scenic museum cafe.')).toBeInTheDocument()
  expect(screen.queryByText('Good stop nearby.')).not.toBeInTheDocument()
  expect(screen.queryByText(/Google/)).not.toBeInTheDocument()
})

it('calls onAdd when the arrow button is clicked', () => {
  const onAdd = jest.fn()
  render(<RecommendationCard rec={rec} dateIso="2026-07-01" onAdd={onAdd} />)
  fireEvent.click(screen.getByTestId('rec-add-p1'))
  expect(onAdd).toHaveBeenCalledTimes(1)
})
