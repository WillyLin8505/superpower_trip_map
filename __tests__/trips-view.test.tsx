/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const renameTrip = jest.fn()
const deleteTrip = jest.fn()
jest.mock('@/app/actions/trips', () => ({
  renameTrip: (...a: unknown[]) => renameTrip(...a),
  deleteTrip: (...a: unknown[]) => deleteTrip(...a),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
import { TripsView } from '@/components/TripsView'

const trips = [{ id: 'a', title: '東京三日', updatedAt: '2026-07-01T00:00:00Z' }]

beforeEach(() => {
  renameTrip.mockReset()
  deleteTrip.mockReset()
  window.confirm = jest.fn(() => true)
})

it('shows empty state when no trips', () => {
  render(<TripsView trips={[]} />)
  expect(screen.getByText('還沒有儲存的行程,從首頁建立一個吧')).toBeInTheDocument()
})

it('lists trips with an open link', () => {
  render(<TripsView trips={trips} />)
  expect(screen.getByRole('link', { name: '東京三日' })).toHaveAttribute('href', '/itinerary/a')
})

it('delete calls deleteTrip', async () => {
  deleteTrip.mockResolvedValue(undefined)
  render(<TripsView trips={trips} />)
  fireEvent.click(screen.getByRole('button', { name: '刪除' }))
  await waitFor(() => expect(deleteTrip).toHaveBeenCalledWith('a'))
})
