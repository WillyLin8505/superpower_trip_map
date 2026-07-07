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

beforeEach(() => {
  signInWithOAuth.mockClear()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
})

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

it('degrades gracefully when Supabase is not configured: buttons disabled, no client call', () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const LoginPage = require('@/app/login/page').default
  render(<LoginPage />)
  const google = screen.getByRole('button', { name: '使用 Google 登入' })
  expect(google).toBeDisabled()
  fireEvent.click(google)
  expect(signInWithOAuth).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('登入尚未設定')
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
