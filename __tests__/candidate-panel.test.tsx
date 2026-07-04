/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { CandidatePanel } from '@/components/CandidatePanel'
import type { Candidate, Place } from '@/lib/types'

jest.mock('@/components/CombinedInput', () => ({
  CombinedInput: ({ onAdd }: { onAdd: (p: Place) => void }) => (
    <button onClick={() => onAdd({ id: 'x', placeId: 'x', name: '新地點', type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null })}>mock-search-add</button>
  ),
}))

function cand(id: string, name: string): Candidate {
  return {
    id, addedBy: 'u2', addedByName: '小明',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  }
}
const noop = () => {}

it('empty pool shows the empty message', () => {
  render(<CandidatePanel candidates={[]} dayCount={2} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} onPromote={noop} />)
  expect(screen.getByText('還沒有候選，搜尋想去的地方加進來吧')).toBeInTheDocument()
})

it('lists candidates with name and adder', () => {
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dayCount={2} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} onPromote={noop} />)
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText(/小明/)).toBeInTheDocument()
})

it('search add calls onAddPlace', () => {
  const onAddPlace = jest.fn()
  render(<CandidatePanel candidates={[]} dayCount={2} onAddPlace={onAddPlace} onAddPlaces={noop} onRemove={noop} onPromote={noop} />)
  fireEvent.click(screen.getByText('mock-search-add'))
  expect(onAddPlace).toHaveBeenCalledWith(expect.objectContaining({ name: '新地點' }))
})

it('remove calls onRemove with candidate id', () => {
  const onRemove = jest.fn()
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dayCount={2} onAddPlace={noop} onAddPlaces={noop} onRemove={onRemove} onPromote={noop} />)
  fireEvent.click(screen.getByRole('button', { name: '移除' }))
  expect(onRemove).toHaveBeenCalledWith('c1')
})

it('promote to a chosen day calls onPromote(place, dayIndex, id)', () => {
  const onPromote = jest.fn()
  render(<CandidatePanel candidates={[cand('c1', '台北101')]} dayCount={3} onAddPlace={noop} onAddPlaces={noop} onRemove={noop} onPromote={onPromote} />)
  fireEvent.change(screen.getByLabelText('放進第幾天 台北101'), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '放進' }))
  expect(onPromote).toHaveBeenCalledWith(expect.objectContaining({ name: '台北101' }), 1, 'c1')
})
