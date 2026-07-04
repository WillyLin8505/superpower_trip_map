/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { HeaderView } from '@/components/HeaderView'

it('shows 登入 link when no user', () => {
  render(<HeaderView user={null} />)
  expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login')
})

it('shows name, 我的行程, 登出 when logged in', () => {
  render(<HeaderView user={{ name: '小明', avatarUrl: null }} />)
  expect(screen.getByText('小明')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '我的行程' })).toHaveAttribute('href', '/trips')
  expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument()
})
