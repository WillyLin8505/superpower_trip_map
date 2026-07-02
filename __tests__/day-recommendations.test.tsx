/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayRecommendations } from '@/components/DayRecommendations'
import type { CategoryBuckets, CategoryList, DayRecommendation } from '@/lib/types'

function rec(placeId: string, type: DayRecommendation['type']): DayRecommendation {
  return {
    id: placeId, placeId, name: placeId, type, lat: 25, lng: 121, address: '',
    openingHours: null, rating: null, photoUrl: null, description: null,
    reason: 'r', sourceLabel: 's',
  }
}
const list = (shown: DayRecommendation[], reserve: DayRecommendation[] = []): CategoryList => ({ shown, reserve })

const buckets: CategoryBuckets = {
  dessert: list([rec('d1', 'dessert')]),
  attraction: list([rec('a1', 'attraction')]),
  restaurant: list([rec('r1', 'restaurant')]),
}
const empty: CategoryBuckets = { dessert: list([]), attraction: list([]), restaurant: list([]) }

it('returns null when there are no shown recommendations', () => {
  const { container } = render(<DayRecommendations recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} />)
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
  expect(onAdd).toHaveBeenCalledWith(buckets.dessert.shown[0])
})

it('renders a placeholder for a category that is backfilling', () => {
  render(
    <DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={() => {}} backfilling={{ dessert: true }} />
  )
  expect(screen.getByTestId('rec-backfilling')).toBeInTheDocument()
})
