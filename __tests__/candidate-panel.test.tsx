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
    id, addedBy: 'u2', addedByName: 'Mina',
    place: { id, placeId: id, name, type: 'attraction', lat: 0, lng: 0, address: '', openingHours: null, rating: null, photoUrl: null, description: null },
  }
}

const noop = () => {}

function renderPanel(overrides: Partial<React.ComponentProps<typeof CandidatePanel>> = {}) {
  return render(
    <CandidatePanel
      candidates={[]}
      onAddPlace={noop}
      onAddPlaces={noop}
      onRemove={noop}
      dateIso="2026-07-01"
      {...overrides}
    />,
  )
}

it('empty pool shows the empty message', () => {
  renderPanel()
  expect(screen.getByText('尚無 LINE 或手動加入的備用地點')).toBeInTheDocument()
})

it('renders candidates using recommendation-card style', () => {
  renderPanel({ candidates: [cand('c1', '台北101')] })
  expect(screen.getByTestId('candidate-card-c1')).toBeInTheDocument()
  expect(screen.getByTestId('rec-c1')).toBeInTheDocument()
  expect(screen.getByText('台北101')).toBeInTheDocument()
  expect(screen.getByText(/LINE \/ Mina/)).toBeInTheDocument()
})

it('search add calls onAddPlace', () => {
  const onAddPlace = jest.fn()
  renderPanel({ onAddPlace })
  fireEvent.click(screen.getByText('mock-search-add'))
  expect(onAddPlace).toHaveBeenCalledWith(expect.objectContaining({ name: '新地點' }))
})

it('add arrow calls onAddToDay with candidate id and place', () => {
  const candidate = cand('c1', '台北101')
  const onAddToDay = jest.fn()
  renderPanel({ candidates: [candidate], onAddToDay })
  fireEvent.click(screen.getByTestId('rec-add-c1'))
  expect(onAddToDay).toHaveBeenCalledWith('c1', candidate.place)
})

it('remove calls onRemove with candidate id', () => {
  const onRemove = jest.fn()
  renderPanel({ candidates: [cand('c1', '台北101')], onRemove })
  fireEvent.click(screen.getByRole('button', { name: '移除' }))
  expect(onRemove).toHaveBeenCalledWith('c1')
})
