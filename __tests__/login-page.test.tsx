/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

const signInWithOAuth = jest.fn()
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a) } }),
}))

// Default mock: ?next=/trips
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

it('Google button calls signInWithOAuth with provider google and redirectTo containing /auth/callback?next=', () => {
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: '使用 Google 登入' }))
  expect(signInWithOAuth).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'google',
      options: expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback?next=') }),
    }),
  )
})

it('LINE button calls signInWithOAuth with provider line', () => {
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: '使用 LINE 登入' }))
  expect(signInWithOAuth).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'line' }),
  )
})

it('open-redirect guard: malicious next (//evil.com) is rejected and defaults to /trips', () => {
  // Override the navigation mock for this test only
  jest.resetModules()
  jest.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams('next=//evil.com'),
  }))
  jest.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a) } }),
  }))
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  fireEvent.click(screen.getByRole('button', { name: '使用 Google 登入' }))
  expect(signInWithOAuth).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: expect.stringContaining('next=%2Ftrips'),
      }),
    }),
  )
})
