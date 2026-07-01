/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayRecommendations } from '@/components/DayRecommendations'
import type { CategoryBuckets, DayRecommendation } from '@/lib/types'

function rec(placeId: string, type: DayRecommendation['type']): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}

const buckets: CategoryBuckets = {
  dessert: [rec('d1', 'dessert')],
  attraction: [rec('a1', 'attraction')],
  restaurant: [rec('r1', 'restaurant')],
}

it('returns null when there are no recommendations', () => {
  const { container } = render(
    <DayRecommendations recommendations={{ dessert: [], attraction: [], restaurant: [] }} dateIso="2026-07-01" onAdd={() => {}} />
  )
  expect(container).toBeEmptyDOMElement()
})

it('shows the default (dessert) tab first, then switches tabs', () => {
  render(<DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={() => {}} />)
  expect(screen.getByTestId('rec-add-d1')).toBeInTheDocument()
  expect(screen.queryByTestId('rec-add-r1')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTestId('rec-tab-restaurant'))
  expect(screen.getByTestId('rec-add-r1')).toBeInTheDocument()
  expect(screen.queryByTestId('rec-add-d1')).not.toBeInTheDocument()
})

it('forwards the clicked recommendation to onAdd', () => {
  const onAdd = jest.fn()
  render(<DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={onAdd} />)
  fireEvent.click(screen.getByTestId('rec-add-d1'))
  expect(onAdd).toHaveBeenCalledWith(buckets.dessert[0])
})
