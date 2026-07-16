/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

const deleteTrip = jest.fn()
const refresh = jest.fn()

jest.mock('@/app/actions/trips', () => ({
  renameTrip: jest.fn(),
  deleteTrip: (...args: unknown[]) => deleteTrip(...args),
}))

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { TripsView } from '@/components/TripsView'

const trips = [
  { id: 'a', title: '河內行程', updatedAt: '2026-07-01T00:00:00Z' },
  { id: 'b', title: '胡志明行程', updatedAt: '2026-07-02T00:00:00Z' },
]

beforeEach(() => {
  deleteTrip.mockReset()
  refresh.mockReset()
  window.confirm = jest.fn(() => true)
})

it('removes a deleted trip from 我的行程 immediately while the server delete is still pending', () => {
  // Regression: deleting from /trips felt delayed because the row stayed visible until deleteTrip/router.refresh completed.
  // Found by /qa on 2026-07-16.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-07-16.md
  deleteTrip.mockReturnValue(new Promise(() => undefined))

  render(<TripsView trips={trips} />)

  fireEvent.click(screen.getAllByRole('button', { name: '刪除' })[0])

  expect(screen.queryByRole('link', { name: '河內行程' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '胡志明行程' })).toBeInTheDocument()
  expect(deleteTrip).toHaveBeenCalledWith('a')
  expect(refresh).not.toHaveBeenCalled()
})
