/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { TimeScrollPicker } from '@/components/TimeScrollPicker'

test('displays the current value as trigger text', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  expect(screen.getByRole('button', { name: '09:30' })).toBeInTheDocument()
})

test('picker panel is hidden initially', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  expect(screen.queryByText('08')).toBeNull()  // hour 08 only visible when open
})

test('clicking trigger opens the picker', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  expect(screen.getByText('08')).toBeInTheDocument()
})

test('clicking an hour calls onChange with new HH:MM', () => {
  const onChange = jest.fn()
  render(<TimeScrollPicker value="09:30" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  // Click hour "14"
  fireEvent.click(screen.getByText('14'))
  expect(onChange).toHaveBeenCalledWith('14:30')
})

test('clicking a minute calls onChange with new HH:MM', () => {
  const onChange = jest.fn()
  render(<TimeScrollPicker value="09:30" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  // Click minute "45"
  fireEvent.click(screen.getByText('45'))
  expect(onChange).toHaveBeenCalledWith('09:45')
})

test('hours list contains 00 through 23', () => {
  render(<TimeScrollPicker value="09:30" onChange={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '09:30' }))
  expect(screen.getByText('00')).toBeInTheDocument()
  expect(screen.getByText('23')).toBeInTheDocument()
})

test('minutes list contains 00, 05, 10 … 55', () => {
  render(<TimeScrollPicker value="09:00" onChange={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '09:00' }))
  expect(screen.getByText('55')).toBeInTheDocument()
})
