/** @jest-environment jsdom */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'

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
})
