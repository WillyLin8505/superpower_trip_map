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

it('always renders the section, even with zero shown recommendations (DEC-301)', () => {
  render(<DayRecommendations recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} />)
  expect(screen.getByTestId('day-recommendations')).toBeInTheDocument()
  expect(screen.getByText('這個類別暫無推薦')).toBeInTheDocument()
})

it('shows a loading row when recommendations is undefined (initial fetch)', () => {
  render(<DayRecommendations recommendations={undefined} dateIso="2026-07-01" onAdd={() => {}} />)
  expect(screen.getByTestId('rec-loading')).toHaveTextContent('載入推薦中…')
  expect(screen.queryByTestId('rec-tab-dessert')).not.toBeInTheDocument()
})

it('shows a recoverable error and keeps center controls when error is set', () => {
  render(
    <DayRecommendations
      recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} error="推薦載入失敗，請稍後再試"
      onSetCenter={() => {}}
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent('推薦載入失敗，請稍後再試')
  expect(screen.getByTestId('rec-center-control')).toBeInTheDocument()
  expect(screen.queryByTestId('rec-tab-dessert')).not.toBeInTheDocument()
})

it('shows the missing-center prompt when hasCenter is false', () => {
  render(<DayRecommendations recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} hasCenter={false} />)
  expect(screen.getByTestId('rec-missing-center')).toHaveTextContent('選擇這一天的推薦中心')
})

it('does not show the missing-center prompt when hasCenter is true', () => {
  render(<DayRecommendations recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} hasCenter={true} />)
  expect(screen.queryByTestId('rec-missing-center')).not.toBeInTheDocument()
})

it('shows the center picker input when no manual center is set', () => {
  render(<DayRecommendations recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} onSetCenter={() => {}} />)
  expect(screen.getByTestId('rec-center-input')).toBeInTheDocument()
})

it('shows the manual center label and a clear button when a center is set', () => {
  const onClearCenter = jest.fn()
  render(
    <DayRecommendations
      recommendations={empty} dateIso="2026-07-01" onAdd={() => {}}
      onSetCenter={() => {}} onClearCenter={onClearCenter}
      center={{ placeId: 'p1', name: '台北車站', lat: 25, lng: 121, address: null, source: 'manual' }}
    />
  )
  expect(screen.getByText('📍 台北車站')).toBeInTheDocument()
  expect(screen.queryByTestId('rec-center-input')).not.toBeInTheDocument()
  fireEvent.click(screen.getByTestId('rec-center-clear'))
  expect(onClearCenter).toHaveBeenCalled()
})

it('clicking 換一批 calls onRefreshCategory with the active tab', () => {
  const onRefreshCategory = jest.fn()
  render(<DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={() => {}} onRefreshCategory={onRefreshCategory} />)
  fireEvent.click(screen.getByTestId('rec-refresh'))
  expect(onRefreshCategory).toHaveBeenCalledWith('dessert')
  fireEvent.click(screen.getByTestId('rec-tab-restaurant'))
  fireEvent.click(screen.getByTestId('rec-refresh'))
  expect(onRefreshCategory).toHaveBeenCalledWith('restaurant')
})

it('disables 換一批 while the active category is refreshing', () => {
  render(
    <DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={() => {}}
      onRefreshCategory={() => {}} refreshing={{ dessert: true }} />
  )
  expect(screen.getByTestId('rec-refresh')).toBeDisabled()
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

it('renders recommendation-list cards in compact mode', () => {
  const richBuckets: CategoryBuckets = {
    ...empty,
    dessert: list([{
      ...rec('rich-1', 'dessert'),
      rating: 4.9,
      photoUrl: '/api/photo?ref=one',
      photoUrls: ['/api/photo?ref=one', '/api/photo?ref=two'],
      description: 'Detailed description',
      reason: 'Detailed reason',
      sourceLabel: 'Google',
    }]),
  }

  render(<DayRecommendations recommendations={richBuckets} dateIso="2026-07-01" onAdd={() => {}} />)

  expect(screen.getByText('rich-1')).toBeInTheDocument()
  expect(screen.getByTestId('photo-thumb-0')).toBeInTheDocument()
  expect(screen.queryByTestId('photo-thumb-1')).toBeNull()
  expect(screen.queryByText(/4.9/)).not.toBeInTheDocument()
  expect(screen.queryByText('Detailed description')).not.toBeInTheDocument()
  expect(screen.queryByText('Detailed reason')).not.toBeInTheDocument()
  expect(screen.queryByText(/Google/)).not.toBeInTheDocument()
})

it('renders a placeholder for a category that is backfilling', () => {
  render(
    <DayRecommendations recommendations={buckets} dateIso="2026-07-01" onAdd={() => {}} backfilling={{ dessert: true }} />
  )
  expect(screen.getByTestId('rec-backfilling')).toBeInTheDocument()
})

it('shows the backfilling placeholder even when all categories are empty', () => {
  render(<DayRecommendations recommendations={empty} dateIso="2026-07-01" onAdd={() => {}} backfilling={{ dessert: true }} />)
  expect(screen.getByTestId('rec-backfilling')).toBeInTheDocument()
  expect(screen.queryByText('這個類別暫無推薦')).not.toBeInTheDocument()
})
