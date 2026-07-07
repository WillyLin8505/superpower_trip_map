/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'

const getUser = jest.fn()
const joinTrip = jest.fn()
const redirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
    },
  }),
}))

jest.mock('@/app/actions/members', () => ({
  joinTrip: (...args: unknown[]) => joinTrip(...args),
}))

jest.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
}))

beforeEach(() => {
  getUser.mockReset()
  joinTrip.mockReset()
  redirect.mockClear()
})

it('redirects logged-out users to login with encoded next path', async () => {
  getUser.mockResolvedValue({ data: { user: null } })

  const JoinPage = require('@/app/join/[token]/page').default

  await expect(JoinPage({ params: { token: 'invite-123' } })).rejects.toThrow(
    'NEXT_REDIRECT:/login?next=%2Fjoin%2Finvite-123',
  )
  expect(joinTrip).not.toHaveBeenCalled()
})

it('joins trip for logged-in users and redirects to itinerary', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  joinTrip.mockResolvedValue({ tripId: 'trip-123' })

  const JoinPage = require('@/app/join/[token]/page').default

  await expect(JoinPage({ params: { token: 'invite-123' } })).rejects.toThrow(
    'NEXT_REDIRECT:/itinerary/trip-123',
  )
  expect(joinTrip).toHaveBeenCalledWith('invite-123')
})

it('renders invalid invite state when joinTrip throws INVALID_INVITE', async () => {
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  joinTrip.mockRejectedValue(new Error('INVALID_INVITE'))

  const JoinPage = require('@/app/join/[token]/page').default

  const element = await JoinPage({ params: { token: 'invite-123' } })
  render(element)

  expect(screen.getByText('邀請連結無效或已失效')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到我的行程' })).toHaveAttribute('href', '/trips')
})
