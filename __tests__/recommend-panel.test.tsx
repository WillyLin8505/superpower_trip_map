/** @jest-environment jsdom */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

jest.mock('@/app/actions/recommend', () => ({
  getRecommendations: jest.fn().mockResolvedValue([]),
}))

import { RecommendPanel } from '@/components/RecommendPanel'
import { getRecommendations } from '@/app/actions/recommend'

const noopAdd = jest.fn()

describe('RecommendPanel', () => {
  beforeEach(() => jest.clearAllMocks())

  it('calls getRecommendations automatically on mount without user interaction', async () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    await waitFor(() => expect(getRecommendations).toHaveBeenCalledTimes(1))
  })

  it('shows loading state immediately on mount', () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    expect(screen.getByText('分析中...')).toBeInTheDocument()
  })

  it('shows empty message when recommendations list is empty', async () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    await waitFor(() =>
      expect(screen.getByText(/目前沒有推薦/)).toBeInTheDocument()
    )
  })

  it('shows refresh button after initial load completes', async () => {
    render(<RecommendPanel currentPlaces={[]} onAddPlaces={noopAdd} />)
    await waitFor(() =>
      expect(screen.getByText('重新整理推薦')).toBeInTheDocument()
    )
  })

  it('preserves localized fields when adding selected recommendations', async () => {
    ;(getRecommendations as jest.Mock).mockResolvedValueOnce([
      {
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
        localizedAddress: {
          zhTw: '台北市士林區至善路二段221號',
          original: '台北市士林區至善路二段221號',
        },
        verified: true,
      },
    ])
    const onAddPlaces = jest.fn()

    render(<RecommendPanel currentPlaces={[]} onAddPlaces={onAddPlaces} />)
    await waitFor(() => expect(screen.getByText('國立故宮博物院')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('加入 1 個地點並重新排序'))

    expect(onAddPlaces).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'National Palace Museum',
        localizedName: {
          zhTw: '國立故宮博物院',
          en: 'National Palace Museum',
          original: 'National Palace Museum',
        },
        localizedAddress: {
          zhTw: '台北市士林區至善路二段221號',
          original: '台北市士林區至善路二段221號',
        },
      }),
    ])
  })
})
