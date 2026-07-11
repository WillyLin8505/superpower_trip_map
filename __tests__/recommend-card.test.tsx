/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import type { Recommendation } from '@/lib/types'
import { RecommendCard } from '@/components/RecommendCard'

const BASE_RECOMMENDATION: Recommendation = {
  name: 'National Palace Museum',
  localizedName: {
    zhTw: '國立故宮博物院',
    en: 'National Palace Museum',
    original: 'National Palace Museum',
  },
  type: 'attraction',
  reason: '適合安排半日參觀。',
  sourceLabel: '測試來源',
  placeId: 'place-1',
  lat: 25.102,
  lng: 121.548,
  verified: true,
}

test('shows localized primary and secondary recommendation names', () => {
  render(<RecommendCard rec={BASE_RECOMMENDATION} selected={false} onToggle={jest.fn()} />)

  expect(screen.getByText('國立故宮博物院')).toBeInTheDocument()
  expect(screen.getByText('National Palace Museum')).toBeInTheDocument()
})

test('hides duplicate localized recommendation secondary name', () => {
  render(
    <RecommendCard
      rec={{
        ...BASE_RECOMMENDATION,
        name: '國立故宮博物院',
        localizedName: {
          zhTw: '國立故宮博物院',
          en: '國立故宮博物院',
          original: '國立故宮博物院',
        },
      }}
      selected={false}
      onToggle={jest.fn()}
    />
  )

  expect(screen.getAllByText('國立故宮博物院')).toHaveLength(1)
})
