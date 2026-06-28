/** @jest-environment jsdom */
import { render, screen, fireEvent } from '@testing-library/react'
import { TypePicker } from '@/components/TypePicker'

describe('TypePicker', () => {
  it('shows current type and opens a menu with four options', () => {
    render(<TypePicker type="attraction" onChange={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /景點/ }))
    expect(screen.getByText('🏨 住宿')).toBeInTheDocument()
    expect(screen.getByText('🍽 餐廳')).toBeInTheDocument()
    expect(screen.getByText('🍰 甜點')).toBeInTheDocument()
    expect(screen.getByText('🏔 景點')).toBeInTheDocument()
  })

  it('calls onChange with the selected type and closes the menu', () => {
    const onChange = jest.fn()
    render(<TypePicker type="attraction" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /景點/ }))
    fireEvent.click(screen.getByText('🏨 住宿'))
    expect(onChange).toHaveBeenCalledWith('accommodation')
    expect(screen.queryByText('🍽 餐廳')).not.toBeInTheDocument()
  })

  it('marks the current type with a check', () => {
    render(<TypePicker type="restaurant" onChange={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /餐廳/ }))
    // the selected option row contains both the label and a check mark
    expect(screen.getByText('✓')).toBeInTheDocument()
  })
})
