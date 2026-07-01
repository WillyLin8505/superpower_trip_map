/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

const signInWithOAuth = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a) } }),
}))
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('next=/trips'),
}))

beforeEach(() => { signInWithOAuth.mockClear() })

it('renders Google + LINE buttons', () => {
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  expect(screen.getByRole('button', { name: '使用 Google 登入' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '使用 LINE 登入' })).toBeInTheDocument()
})

it('Google button calls signInWithOAuth with provider google', () => {
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: '使用 Google 登入' }))
  expect(signInWithOAuth).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'google' }),
  )
})
