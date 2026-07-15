/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react'
import { TripCostBadge } from '@/components/TripCostBadge'

test('renders the estimated cost as US$ with 2 decimals', () => {
  render(<TripCostBadge usd={0.42} />)
  expect(screen.getByText(/估算花費 ≈ US\$0\.42/)).toBeInTheDocument()
})

test('renders US$0.00 for zero spend', () => {
  render(<TripCostBadge usd={0} />)
  expect(screen.getByText(/US\$0\.00/)).toBeInTheDocument()
})

test('labels the value as an estimate (not a real bill)', () => {
  render(<TripCostBadge usd={1.2} />)
  const badge = screen.getByLabelText(/本行程估算花費 US\$1\.20/)
  expect(badge).toHaveAttribute('title', expect.stringContaining('估算'))
})

test('guards against NaN', () => {
  render(<TripCostBadge usd={NaN} />)
  expect(screen.getByText(/US\$0\.00/)).toBeInTheDocument()
})
