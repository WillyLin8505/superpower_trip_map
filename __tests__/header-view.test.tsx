/** @jest-environment jsdom */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { HeaderView } from '@/components/HeaderView'

it('shows 登入 link when no user', () => {
  render(<HeaderView user={null} />)
  expect(screen.getByRole('link', { name: '登入' })).toHaveAttribute('href', '/login')
  expect(screen.getByRole('link', { name: '後台登入' })).toHaveAttribute('href', '/login?next=/admin')
})

it('shows name, 我的行程, 登出 when logged in', () => {
  render(<HeaderView user={{ name: '小明', avatarUrl: null }} />)
  expect(screen.getByText('小明')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '我的行程' })).toHaveAttribute('href', '/trips')
  expect(screen.getByRole('button', { name: '登出' })).toBeInTheDocument()
})

it('shows 後台 link for admin users', () => {
  render(<HeaderView user={{ name: '管理員', avatarUrl: null, isAdmin: true }} />)
  expect(screen.getByRole('link', { name: '後台' })).toHaveAttribute('href', '/admin')
})
