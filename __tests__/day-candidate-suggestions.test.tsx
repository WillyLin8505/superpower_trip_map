/** @jest-environment jsdom */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { DayCandidateSuggestions } from '@/components/DayCandidateSuggestions'
import type { Candidate } from '@/lib/types'

function cand(id: string, name: string): Candidate {
  return { id, addedBy: 'u2', addedByName: '小明',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '',
      openingHours: null, rating: null, photoUrl: null, description: null } }
}

it('renders null when there are no candidates', () => {
  const { container } = render(<DayCandidateSuggestions candidates={[]} onAdd={() => {}} />)
  expect(container).toBeEmptyDOMElement()
})

it('lists each candidate with name and adder', () => {
  render(<DayCandidateSuggestions candidates={[cand('c1', '台北101')]} onAdd={() => {}} />)
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText(/小明/)).toBeInTheDocument()
})

it('clicking the ← arrow calls onAdd(candidateId, place)', () => {
  const onAdd = jest.fn()
  render(<DayCandidateSuggestions candidates={[cand('c1', '台北101')]} onAdd={onAdd} />)
  fireEvent.click(screen.getByRole('button', { name: '加入 台北101' }))
  expect(onAdd).toHaveBeenCalledWith('c1', expect.objectContaining({ name: '台北101' }))
})
